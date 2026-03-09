import { AppDataSource } from "../data-source";
import { Modules } from "../entity/Modules";

export async function seedDefaultModules() {
  const moduleRepo = AppDataSource.getMongoRepository(Modules);

  const count = await moduleRepo.count();

  if (count > 0) {
    return;
  }

  const modules = [
    "Dashboard",
    "Roles & Permissions",
    "Admin Registration",
    "Members Registration",
    "Region",
    "Zone Creation",
    "Badge Creation",
    "Award",
    "Business Category",
    "Points",
    "Vertical Directors",
    "Chapter Creation",
    "Meeting Creation",
    "Attendance List",
    "Community Update",
    "Star Projects",
    "Mobile Banner Ads",
    "Training",
    "Category List",
    "Create Product",
    "Place Order",
    "Orders List",
    "Log Report",
    "Renewal Report",
    "Chapter Report",
    "121's Report",
    "Referral's Report",
    "Visitor's Report",
    "Absent & Proxy Report",
    "Performance Report",
    "Chief Guest's Report",
    "Thank you Slip Report",
    "Power Meet",
    "Training's Report",
    "Member's List",
    "Testimonials Report",
    "Member Points Report",
    "Member Suggestions",
    "Chief Guest List",
    "Locations",
    "Shipping Methods",
  ];

  const moduleEntities = modules.map(name => {
    const module = new Modules();
    module.name = name;
    module.isActive = 1;
    module.isDelete = 0;
    return module;
  });

  await moduleRepo.save(moduleEntities);

  console.log("🌟 Default Modules seeded successfully");
}
