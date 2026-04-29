import "reflect-metadata";
import { AppDataSource } from "./data-source";
import { seedEcommerceData } from "./seed/ecommerce";

async function runSeed() {
    await AppDataSource.initialize();
    await seedEcommerceData();
    await AppDataSource.destroy();
}

runSeed();
