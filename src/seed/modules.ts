import { AppDataSource } from "../data-source";
import { Modules } from "../entity/Modules";

export async function seedDefaultModules() {
  const moduleRepo = AppDataSource.getMongoRepository(Modules);

  await moduleRepo.deleteMany({});

  const modules = [
    "Dashboard",
    "Category",
    "Sub Category",
    "Brands",
    "Attributes",
    "Unit",
    "Tax",
    "Products",
    "Shipping Methods",
    "Customer Orders",
    "Cancelled Orders",
    "Return Orders",
    "Orders Feedback",
    "User List",
    "Role & Permission",
    "Activity Logs",
    "Customer List",
    "POS Order",
    "POS Order History",
    "Vendor",
    "Purchase Entry",
    "Payment History",
    "Manual Payment",
    "Inventory List",
    "Add Stock",
    "Product Reports",
    "Customer Reports",
    "Vendor Reports",
    "Payment Reports",
    "Sales Reports"
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
