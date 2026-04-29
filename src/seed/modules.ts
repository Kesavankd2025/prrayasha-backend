import { AppDataSource } from "../data-source";
import { Modules } from "../entity/Modules";

export async function seedDefaultModules() {
  const moduleRepo = AppDataSource.getMongoRepository(Modules);

  // Clear existing
  await moduleRepo.deleteMany({});

  const modules = [
    // Main
    "Dashboard",
    "Website",
    "Banner",
    "Testimonials",
    "Advertisement",
    "Youtube",

    // Website
    // "Banner",

    // Blog

    // Master Creation
    "Category",
    "Sub Category",
    "Brands",
    "Attributes",
    "Unit",
    "Tax",
    "Products",
    "Coupons",
    "Shipping Methods",
    // Orders
    "Customer Orders",
    // "Cancelled Orders",
    // "Return Orders",
    "Customer Reviews",

    // Users
    "User List",
    "Role & Permission",
    "Activity Logs",
    "Customer List",
    "Notify Me",
    "Contact Us",

    // Payments
    "Payment History",
    "Manual Payment",

    // Inventory
    "Inventory List",
    "Add Stock",
    "Customer Reports",
    "Payment Reports",
    "Stock Reports"
  ];

  const moduleEntities = modules.map((name) => {
    const module = new Modules();
    module.name = name;
    module.isActive = 1;
    module.isDelete = 0;
    return module;
  });

  await moduleRepo.save(moduleEntities);

  console.log("🌟 Default Modules seeded successfully");
}