import { AppDataSource } from "../data-source";
import { Admin } from "../entity/Admin";
import bcrypt from "bcryptjs";

export async function seedDefaultAdmin() {
  const adminRepo = AppDataSource.getMongoRepository(Admin);

  const count = await adminRepo.countDocuments({ isDelete: 0 });

  if (count > 0) {
    return;
  }

  const defaultAdmin = new Admin();
  defaultAdmin.name = "Star Admin";
  defaultAdmin.email = "admin@starforum.in";
  defaultAdmin.companyName = "Star Forum";
  defaultAdmin.phoneNumber = "9988776655";
  defaultAdmin.pin = await bcrypt.hash("2016", 10);
  defaultAdmin.role = "ADMIN";
  defaultAdmin.isActive = 1;
  defaultAdmin.isDelete = 0;

  await adminRepo.save(defaultAdmin);

  console.log("🌟 Default Admin seeded successfully");
}
