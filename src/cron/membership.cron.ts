import cron from "node-cron";
import { AppDataSource } from "../data-source";
import { Member } from "../entity/Member";
import { SuspensionHistory } from "../entity/SuspensionHistory";
import { updateChapterBadge } from "../utils/chapter.badge";

const memberRepo = AppDataSource.getMongoRepository(Member);
const suspensionRepo = AppDataSource.getMongoRepository(SuspensionHistory);

cron.schedule("0 0 * * *", async () => {
    console.log("🕒 Running Membership Expiration Cron Job...");

    try {
        const now = new Date();
        const expiredMembers = await memberRepo.find({
            where: {
                isActive: 1,
                isDelete: 0,
                renewalDate: { $lt: now }
            }
        });

        if (expiredMembers.length > 0) {
            console.log(`📌 Found ${expiredMembers.length} expired memberships.`);
            const chaptersToUpdate = new Set<string>();

            for (const member of expiredMembers) {
                member.isActive = 0;
                member.updatedAt = new Date();
                await memberRepo.save(member);

                await suspensionRepo.save({
                    memberId: member.id,
                    reason: "Renewal Expiry",
                    action: "Suspended",
                    actionBy: "System",
                    createdAt: new Date(),
                    updatedAt: new Date()
                });
                console.log(`✅ Member ${member.fullName} (${member.membershipId}) set to inactive.`);

                if (member.chapter) {
                    chaptersToUpdate.add(member.chapter.toString());
                }
            }

            for (const chapterId of chaptersToUpdate) {
                await updateChapterBadge(chapterId);
            }
        } else {
            console.log("✅ No expired memberships found today.");
        }

    } catch (error) {
        console.error("❌ Error in Membership Expiration Cron:", error);
    }
});
