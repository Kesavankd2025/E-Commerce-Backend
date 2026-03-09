import cron from "node-cron";
import { AppDataSource } from "../data-source";
import { Meeting } from "../entity/Meeting";
import { updateChapterBadge } from "../utils/chapter.badge";
import { Training } from "../entity/Training";
import { Member } from "../entity/Member";
import { Attendance } from "../entity/Attendance";
import { TrainingParticipants } from "../entity/TrainingParticipants";
import { AttendanceStatusEnum } from "../dto/mobile/Attendance.dto";
import { Chapter } from "../entity/Chapter";
import { SuspensionHistory } from "../entity/SuspensionHistory";
import { ObjectId } from "mongodb";

const memberRepo = AppDataSource.getMongoRepository(Member);
const meetingRepo = AppDataSource.getMongoRepository(Meeting);
const trainingRepo = AppDataSource.getMongoRepository(Training);
const attendanceRepo = AppDataSource.getMongoRepository(Attendance);
const chapterRepo = AppDataSource.getMongoRepository(Chapter);
const suspensionRepo = AppDataSource.getMongoRepository(SuspensionHistory);
const trainingParticipantsRepo =
  AppDataSource.getMongoRepository(TrainingParticipants);

async function checkAndSuspendMember(memberId: any): Promise<void> {
  try {
    const member = await memberRepo.findOneBy({ _id: new ObjectId(String(memberId)), isDelete: 0, isActive: 1 });
    if (!member || !member.chapter) return;

    const chapter = await chapterRepo.findOneBy({ _id: new ObjectId(member.chapter) });
    if (!chapter) return;

    const absentLimit = chapter.absentLimit ?? null;
    const proxyLimit = chapter.proxyLimit ?? null;

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    let tenureStart: Date;
    let tenureEnd: Date;

    if (currentMonth <= 5) {
      tenureStart = new Date(currentYear, 0, 1, 0, 0, 0, 0);
      tenureEnd = new Date(currentYear, 5, 30, 23, 59, 59, 999);
    } else {
      tenureStart = new Date(currentYear, 6, 1, 0, 0, 0, 0);
      tenureEnd = new Date(currentYear, 11, 31, 23, 59, 59, 999);
    }

    if (absentLimit !== null) {
      const absentCount = await attendanceRepo.countDocuments({
        memberId: memberId,
        status: AttendanceStatusEnum.ABSENT,
        isDelete: 0,
        createdAt: {
          $gte: tenureStart,
          $lte: tenureEnd
        }
      });
      if (absentCount >= absentLimit) {
        await memberRepo.update(memberId, { isActive: 0 });
        await updateChapterBadge(member.chapter);

        await suspensionRepo.save({
          memberId: memberId,
          reason: "Absent LimitCrossed",
          action: "Suspended",
          actionBy: "System",
          createdAt: new Date(),
          updatedAt: new Date()
        });

        console.log(`🚫 Member ${memberId} suspended — absent: ${absentCount}/${absentLimit}`);
        return;
      }
    }

    if (proxyLimit !== null) {
      const proxyCount = await attendanceRepo.countDocuments({
        memberId: new ObjectId(String(memberId)),
        status: AttendanceStatusEnum.PROXY,
        isDelete: 0,
        createdAt: {
          $gte: tenureStart,
          $lte: tenureEnd
        }
      });
      if (proxyCount >= proxyLimit) {
        await memberRepo.update(memberId, { isActive: 0 });
        await updateChapterBadge(member.chapter);

        await suspensionRepo.save({
          memberId: memberId,
          reason: "Proxy LimitCrossed",
          action: "Suspended",
          actionBy: "System",
          createdAt: new Date(),
          updatedAt: new Date()
        });

        console.log(`🚫 Member ${memberId} suspended — proxy: ${proxyCount}/${proxyLimit}`);
      }
    }
  } catch (err) {
    console.error("Suspension check failed in cron:", err);
  }
}

cron.schedule("*/5 * * * *", async () => {

  const now = new Date();

  const expiredMeetings = await meetingRepo.find({
    where: {
      isDelete: 0,
      isActive: 1,
      endDateTime: { $lt: now }
    }
  });

  for (const meeting of expiredMeetings) {

    const members = await memberRepo.find({
      where: {
        chapter: { $in: meeting.chapters },
        isActive: 1,
        isDelete: 0
      },
      select: { id: true }
    });

    const memberIds = members.map((m: any) => m.id);

    if (!memberIds.length) continue;

    const existing = await attendanceRepo.find({
      where: {
        sourceId: meeting._id,
        sourceType: "MEETING",
        memberId: { $in: memberIds },
      },
      select: { memberId: true }
    });

    const existingIds = new Set(existing.map(e => String(e.memberId)));

    const absentMemberIds = memberIds.filter(id => !existingIds.has(String(id)));

    const bulkDocs = absentMemberIds.map(id => ({
      memberId: id,
      sourceId: meeting._id,
      sourceType: "MEETING",
      status: AttendanceStatusEnum.ABSENT,
      isActive: 1,
      isDelete: 0,
      createdAt: new Date()
    }));

    if (bulkDocs.length) {
      await attendanceRepo.insertMany(bulkDocs);

      for (const memberId of absentMemberIds) {
        await checkAndSuspendMember(memberId);
      }
    }
  }

  const trainings = await trainingRepo.find({
    where: {
      isDelete: 0,
      isActive: 1,
      trainingDateTime: { $lt: now }
    }
  });

  for (const training of trainings) {

    const startTime = new Date(training.trainingDateTime);
    const durationInHours = Number(training.duration) || 0;

    const endTime = new Date(
      startTime.getTime() + durationInHours * 60 * 60 * 1000
    );

    if (endTime > now) continue;

    const participants = await trainingParticipantsRepo.find({
      where: {
        trainingId: training.id,
        status: "Approved",
        paymentStatus: "Paid",
        isActive: 1,
        isDelete: 0
      },
      select: { memberId: true }
    });

    const memberIds = participants.map((p: any) => p.memberId);

    if (!memberIds.length) continue;

    const existing = await attendanceRepo.find({
      where: {
        sourceId: training.id,
        sourceType: "TRAINING",
        memberId: { $in: memberIds },
      },
      select: { memberId: true }
    });

    const existingIds = new Set(existing.map(e => String(e.memberId)));

    const bulkDocs = memberIds
      .filter(id => !existingIds.has(String(id)))
      .map(id => ({
        memberId: id,
        sourceId: training.id,
        sourceType: "TRAINING",
        status: AttendanceStatusEnum.ABSENT,
        isActive: 1,
        isDelete: 0,
        createdAt: new Date()
      }));

    if (bulkDocs.length) {
      await attendanceRepo.insertMany(bulkDocs);
    }
  }

});

