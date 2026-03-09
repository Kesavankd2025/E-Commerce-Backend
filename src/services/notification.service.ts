import { ObjectId } from "mongodb";
import { AppDataSource } from "../data-source";
import { Notifications } from "../entity/Notification";
import { sendPushNotification } from "./pushNotification.Service";
import { Member } from "../entity/Member";
import { ConnectionRequests } from "../entity/ConnectionRequest";
import { Chapter } from "../entity/Chapter";

export class NotificationService {
  private notificationRepo = AppDataSource.getMongoRepository(Notifications);
  private memRepo = AppDataSource.getMongoRepository(Member);
  private connectionRepo = AppDataSource.getMongoRepository(ConnectionRequests);

  async createNotification({
    moduleName,
    moduleId,
    createdBy,
    subject,
    content,
    model,
    memberId,
    actionType,
  }: {
    moduleName: string;
    moduleId: ObjectId | string;
    createdBy: ObjectId | string;
    subject?: string;
    content?: string;
    model?: string;
    memberId?: ObjectId | string | Array<ObjectId | string>;
    actionType?: "REQUEST" | "APPROVE" | "DECLINE";
  }) {
    const memberIds = Array.isArray(memberId) ? memberId : [memberId];

    for (const id of memberIds) {
      if (!id) continue;

      const payload = {
        moduleName,
        moduleId: new ObjectId(moduleId),
        createdBy: new ObjectId(createdBy),
        updatedBy: new ObjectId(createdBy),
        receiverId: new ObjectId(id),
        actionType: actionType ?? null,
        isActive: 1,
        isRead: false,
        isDelete: 0,
        subject: subject ?? "",
        content: content ?? "",
      };

      const savedNotification = await this.notificationRepo.save(payload);

      if (model === "Member" && savedNotification) {
        const member = await this.memRepo.findOne({
          where: { _id: new ObjectId(id) },
        });

        if (member?.deviceToken) {
          const response: any = await sendPushNotification(
            member.deviceToken,
            subject ?? "New Notification",
            payload
          );

          if (!response?.success && response?.statusCode === 404) {
            await this.memRepo.updateOne(
              { _id: new ObjectId(id) },
              { $set: { deviceToken: "" } }
            );
            console.log(`Removed invalid token for member ${id}`);
          }
        }
      }
    }

    return { success: true };
  }

  async createNotificationCommunity({
    moduleName,
    moduleId,
    createdBy,
    subject,
    content,
    categoryId,
  }: {
    moduleName: string;
    moduleId: ObjectId | string;
    createdBy: ObjectId | string;
    subject?: string;
    content?: string;
    categoryId: ObjectId[];
  }) {
    const creatorId = new ObjectId(createdBy);

    const approvedConnections = await this.connectionRepo.find({
      where: {
        isDelete: 0,
        status: "Approved",
        $or: [
          { createdBy: creatorId },
          { memberId: creatorId }
        ]
      }
    });

    const connectedIds = approvedConnections.map((c) =>
      c.createdBy.toString() === creatorId.toString() ? c.memberId : c.createdBy
    );

    if (connectedIds.length === 0) {
      return { success: true, count: 0 };
    }

    const members = await this.memRepo.find({
      where: {
        _id: { $in: connectedIds, $ne: creatorId },
        businessCategory: { $in: categoryId },
        isActive: 1,
        isDelete: 0,
      },
    });

    const validMembers = members.filter((m) => m.deviceToken);

    const notificationPayloads = validMembers.map((member) => ({
      moduleName,
      moduleId: new ObjectId(moduleId),
      createdBy: creatorId,
      updatedBy: creatorId,
      receiverId: member.id,
      isActive: 1,
      isRead: false,
      isDelete: 0,
      subject: subject ?? "",
      content: content ?? "",
    }));

    if (notificationPayloads.length) {
      await this.notificationRepo.insertMany(notificationPayloads);
    }

    // Push notifications (parallel)
    await Promise.all(
      validMembers.map(async (member) => {
        const pushRes: any = await sendPushNotification(
          member.deviceToken,
          subject ?? "New Notification",
          { moduleName, moduleId, content }
        );

        if (!pushRes?.success && pushRes?.statusCode === 404) {
          await this.memRepo.updateOne(
            { _id: new ObjectId(member.id) },
            { $set: { deviceToken: "" } }
          );
          console.log(`Removed invalid token for member ${member.id}`);
        }
      })
    );

    return { success: true, count: validMembers.length };
  }

  async createNotificationStarUpdate({
    moduleName,
    moduleId,
    createdBy,
    subject,
    content,
    chapterIds,
    categoryIds,
    zoneIds,
    regionIds,
  }: {
    moduleName: string;
    moduleId: ObjectId | string;
    createdBy: ObjectId | string;
    subject?: string;
    content?: string;
    chapterIds: ObjectId[];
    categoryIds: ObjectId[];
    zoneIds: ObjectId[];
    regionIds: ObjectId[];
  }) {
    const chapters = await AppDataSource.getMongoRepository(Chapter).find({
      where: {
        _id: { $in: chapterIds },
        isDelete: 0,
        zoneId: { $in: zoneIds }
      }
    });

    const validChapterIds = chapters.map(c => c.id);

    const members = await this.memRepo.find({
      where: {
        chapter: { $in: validChapterIds },
        businessCategory: { $in: categoryIds },
        region: { $in: regionIds },
        isActive: 1,
        isDelete: 0,
        _id: { $ne: new ObjectId(createdBy) },
      },
    });

    const validMembers = members.filter((m) => m.deviceToken);

    const notificationPayloads = validMembers.map((member) => ({
      moduleName,
      moduleId: new ObjectId(moduleId),
      createdBy: new ObjectId(createdBy),
      updatedBy: new ObjectId(createdBy),
      receiverId: member.id,
      isActive: 1,
      isRead: false,
      isDelete: 0,
      subject: subject ?? "",
      content: content ?? "",
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    if (notificationPayloads.length) {
      await this.notificationRepo.insertMany(notificationPayloads);
    }

    await Promise.all(
      validMembers.map(async (member) => {
        const response: any = await sendPushNotification(
          member.deviceToken,
          subject ?? "New Notification",
          {
            moduleName,
            moduleId,
            content,
          }
        );

        if (!response?.success && response?.statusCode === 404) {
          await this.memRepo.updateOne(
            { _id: new ObjectId(member.id) },
            { $set: { deviceToken: "" } }
          );
          console.log(`Removed invalid token for member ${member.id}`);
        }
      })
    );

    return {
      success: true,
      count: validMembers.length,
    };
  }

  async createNotificationTraining({
    moduleName,
    moduleId,
    createdBy,
    subject,
    content,
    chapterIds,
    zoneIds,
    regionIds,
  }: {
    moduleName: string;
    moduleId: ObjectId | string;
    createdBy: ObjectId | string;
    subject?: string;
    content?: string;
    chapterIds: ObjectId[];
    zoneIds: ObjectId[];
    regionIds: ObjectId[];
  }) {
    const chapters = await AppDataSource.getMongoRepository(Chapter).find({
      where: {
        _id: { $in: chapterIds },
        isDelete: 0,
        zoneId: { $in: zoneIds }
      }
    });

    const validChapterIds = chapters.map(c => c.id);

    const members = await this.memRepo.find({
      where: {
        chapter: { $in: validChapterIds },
        region: { $in: regionIds },
        isActive: 1,
        isDelete: 0,
        _id: { $ne: new ObjectId(createdBy) },
      },
    });

    const validMembers = members.filter((m) => m.deviceToken);

    const notificationPayloads = validMembers.map((member) => ({
      moduleName,
      moduleId: new ObjectId(moduleId),
      createdBy: new ObjectId(createdBy),
      updatedBy: new ObjectId(createdBy),
      receiverId: new ObjectId(member.id),
      isActive: 1,
      isRead: false,
      isDelete: 0,
      subject: subject ?? "",
      content: content ?? "",
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    if (notificationPayloads.length) {
      await this.notificationRepo.insertMany(notificationPayloads);
    }

    await Promise.all(
      validMembers.map(async (member) => {
        const response: any = await sendPushNotification(
          member.deviceToken,
          subject ?? "New Training",
          {
            moduleName,
            moduleId: moduleId.toString(),
            content: content ?? "",
          }
        );

        if (!response?.success && response?.statusCode === 404) {
          await this.memRepo.updateOne(
            { _id: new ObjectId(member.id) },
            { $set: { deviceToken: "" } }
          );
          console.log(`Removed invalid token for member ${member.id}`);
        }
      })
    );

    return {
      success: true,
      count: validMembers.length,
    };
  }
}
