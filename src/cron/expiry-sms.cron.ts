import cron from "node-cron";
import { AppDataSource } from "../data-source";
import { Member } from "../entity/Member";
// import { sendExpirySMS } from "../utils/sms";

const memberRepo = AppDataSource.getMongoRepository(Member);

cron.schedule("0 10,18 * * *", async () => {
    console.log("🕒 Running Membership Expiry SMS Cron Job...");

    try {
        const now = new Date();
        const fifteenDaysLater = new Date();
        fifteenDaysLater.setDate(now.getDate() + 15);

        const expiringMembers = await memberRepo.find({
            where: {
                isActive: 1,
                isDelete: 0,
                renewalDate: {
                    $gt: now,
                    $lte: fifteenDaysLater
                }
            }
        });

        if (expiringMembers.length > 0) {
            console.log(`📌 Found ${expiringMembers.length} members expiring within 15 days.`);

            for (const member of expiringMembers) {
                const expiryDateStr = member.renewalDate.toLocaleDateString('en-GB', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric'
                });

                // await sendExpirySMS(member.fullName, member.phoneNumber, expiryDateStr);
                console.log(`✅ Expiry SMS sent to ${member.fullName} (${member.phoneNumber}).`);
            }
        } else {
            console.log("✅ No members expiring within 15 days found today.");
        }

    } catch (error) {
        console.error("❌ Error in Membership Expiry SMS Cron:", error);
    }
});
