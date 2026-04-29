import "reflect-metadata";
import { AppDataSource } from "./data-source";
import { Category } from "./entity/Category";
import { SubCategory } from "./entity/SubCategory";
import { Brand } from "./entity/Brand";
import { Product } from "./entity/Product";

async function checkData() {
    await AppDataSource.initialize();
    
    const catTotal = await AppDataSource.getMongoRepository(Category).count();
    const subTotal = await AppDataSource.getMongoRepository(SubCategory).count();
    const brandTotal = await AppDataSource.getMongoRepository(Brand).count();
    const productTotal = await AppDataSource.getMongoRepository(Product).count();

    console.log("--- DB Statistics (isDelete=0 Verification) ---");
    console.log("Total Categories:", catTotal);
    console.log("Total Sub-Categories:", subTotal);
    console.log("Total Brands:", brandTotal);
    console.log("Total Products:", productTotal);
    
    // Check one sample for isDelete
    const sample = await AppDataSource.getMongoRepository(Product).findOneBy({});
    console.log("\nSample Product isDelete status:", sample?.isDelete);
    
    await AppDataSource.destroy();
}

checkData();
