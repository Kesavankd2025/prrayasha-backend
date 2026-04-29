import "reflect-metadata";
import { AppDataSource } from "./data-source";
import { Product } from "./entity/Product";

async function checkProduct() {
    await AppDataSource.initialize();
    const repo = AppDataSource.getMongoRepository(Product);
    const sample = await repo.findOneBy({});
    console.log("Product Name:", sample?.name);
    console.log("Attributes structure:", JSON.stringify(sample?.attributes[0], null, 2));
    await AppDataSource.destroy();
}

checkProduct();
