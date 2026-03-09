import { AppDataSource } from "../data-source";
import { Points } from "../entity/Points";

export const seedPoints = async () => {
  const repo = AppDataSource.getMongoRepository(Points);

  const count = await repo.countDocuments();
  if (count > 0) {
    // console.info("✅ Points already seeded");
    return;
  }

  await repo.insertMany([
    {
      key: "one_to_one",
      name: "121s",
      description: "One-to-One Meetings",
      value: 0,
      order: 1,
      isActive: 1,
      isDelete: 0
    },
    {
      key: "referrals",
      name: "Referrals",
      description: "Business Referrals",
      value: 0,
      order: 2,
      isActive: 1,
      isDelete: 0
    },
    {
      key: "weekly_meetings",
      name: "Weekly Meetings",
      description: "Attendance Points",
      value: 0,
      order: 3,
      isActive: 1,
      isDelete: 0
    },
    {
      key: "trainings",
      name: "Trainings",
      description: "Business Trainings",
      value: 0,
      order: 4,
      isActive: 1,
      isDelete: 0
    },
    {
      key: "thank_you_notes",
      name: "Thank You Notes",
      description: "Gratitude Points",
      value: 0,
      order: 5,
      isActive: 1,
      isDelete: 0
    },
    {
      key: "visitors",
      name: "Visitors",
      description: "New Guests Invited",
      value: 0,
      order: 6,
      isActive: 1,
      isDelete: 0
    },
    {
      key: "chief_guests",
      name: "Chief Guests",
      description: "Distinguished Guests",
      value: 0,
      order: 7,
      isActive: 1,
      isDelete: 0
    },
    {
      key: "power_dates",
      name: "Power Meets",
      description: "Strategic Meetings",
      value: 0,
      order: 8,
      isActive: 1,
      isDelete: 0
    },
    {
      key: "inductions",
      name: "Inductions",
      description: "New Member Welcomes",
      value: 0,
      order: 9,
      isActive: 1,
      isDelete: 0
    },
    {
      key: "give",
      name: "Give",
      description: "Members Ready to Give connection",
      value: 0,
      order: 10,
      isActive: 1,
      isDelete: 0
    },
    {
      key: "ask",
      name: "Ask",
      description: "Members Looking for connection",
      value: 0,
      order: 11,
      isActive: 1,
      isDelete: 0
    },
    {
      key: "requirement",
      name: "Requirement",
      description: "New Member Welcomes",
      value: 0,
      order: 12,
      isActive: 1,
      isDelete: 0
    },

  ]);
};
