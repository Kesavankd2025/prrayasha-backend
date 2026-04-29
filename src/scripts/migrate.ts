import { AppDataSource } from "../data-source";
import { Customer } from "../entity/Customer";
import { Category } from "../entity/Category";
import { SubCategory } from "../entity/SubCategory";
import { Product } from "../entity/Product";
import { Attribute } from "../entity/Attribute";
import * as fs from "fs";
import * as readline from "readline";
import { ObjectId } from "mongodb";

function parseSqlTuple(sqlStr: string) {
    let s = sqlStr.trim();
    if (s.startsWith('(')) s = s.substring(1);
    if (s.endsWith('),')) s = s.substring(0, s.length - 2);
    else if (s.endsWith(');')) s = s.substring(0, s.length - 2);
    else if (s.endsWith(')')) s = s.substring(0, s.length - 1);

    const values: (string | null)[] = [];
    let inString = false;
    let buf = '';
    let escape = false;

    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (inString) {
            if (escape) {
                if (c === 'n') buf += '\n';
                else if (c === 'r') buf += '\r';
                else if (c === "'") buf += "'";
                else if (c === "\\") buf += "\\";
                else buf += c;
                escape = false;
            } else if (c === '\\') {
                escape = true;
            } else if (c === "'") {
                if (i + 1 < s.length && s[i+1] === "'") {
                    buf += "'";
                    i++;
                } else {
                    inString = false;
                }
            } else {
                buf += c;
            }
        } else {
            if (c === "'") {
                inString = true;
            } else if (c === ',') {
                values.push(buf.trim() === 'NULL' ? null : buf.trim());
                buf = '';
            } else {
                buf += c;
            }
        }
    }
    values.push(buf.trim() === 'NULL' ? null : buf.trim());
    return values;
}

async function run() {
    await AppDataSource.initialize();
    console.log("Connected to MongoDB!");

    const fileStream = fs.createReadStream("prrayashacollein_live 1.sql");
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    let currentTable: string | null = null;
    let currentColumns: string[] = [];
    
    const categoryMap: { [key: string]: ObjectId } = {};
    const subCategoryMap: { [key: string]: ObjectId } = {};
    
    // Arrays to hold entities for batch insertion
    const customers: Customer[] = [];
    const categories: Category[] = [];
    const subCategories: SubCategory[] = [];
    const products: Product[] = [];
    const attributes: Attribute[] = [];
    
    // Additional mapping for attributes to link to products
    const productAttributesMap: { [prodId: string]: any[] } = {};
    const productMysqlIdMap: { [prodId: string]: any } = {};
    const productStockMap: { [prodId: string]: any } = {};
    const attributeLookup: { [attrName: string]: { id: ObjectId, values: { [valName: string]: ObjectId }, entity: Attribute } } = {};

    // Helper to get column index from current table
    const getVal = (row: any[], colName: string) => {
        const idx = currentColumns.indexOf(colName);
        return idx !== -1 ? row[idx] : null;
    };

    console.log("Parsing SQL Dump...");
    let lineCount = 0;
    
    for await (const line of rl) {
        lineCount++;
        if (lineCount % 10000 === 0) console.log(`Parsed ${lineCount} lines...`);
        
        const insertMatch = line.match(/INSERT INTO \`([^\`]+)\` \((.+?)\) VALUES/);
        if (insertMatch) {
            currentTable = insertMatch[1];
            currentColumns = insertMatch[2].split(',').map(c => c.trim().replace(/\`/g, ''));
            continue;
        }

        if (currentTable && line.trim().startsWith('(')) {
            const row = parseSqlTuple(line);
            
            try {
                if (currentTable === 'customer') {
                    const c = new Customer();
                    c.fullName = getVal(row, 'name') || "";
                    c.phoneNumber = getVal(row, 'phone') || "";
                    c.email = getVal(row, 'email') || "";
                    c.password = getVal(row, 'password') || "";
                    c.address = getVal(row, 'address') || "";
                    c.userType = "registered";
                    c.isActive = getVal(row, 'status') === 'active';
                    c.isDelete = 0;
                    c.createdAt = getVal(row, 'created_at') ? new Date(getVal(row, 'created_at') as string) : new Date();
                    c.updatedAt = getVal(row, 'updated_at') ? new Date(getVal(row, 'updated_at') as string) : new Date();
                    customers.push(c);
                }
                else if (currentTable === 'guests') {
                    const mobile = getVal(row, 'mobile');
                    if (mobile) {
                        const c = new Customer();
                        c.fullName = "Guest";
                        c.phoneNumber = mobile;
                        c.userType = "guest";
                        c.isActive = true;
                        c.isDelete = 0;
                        c.createdAt = getVal(row, 'created_at') ? new Date(getVal(row, 'created_at') as string) : new Date();
                        c.updatedAt = getVal(row, 'updated_at') ? new Date(getVal(row, 'updated_at') as string) : new Date();
                        // avoid duplicate guest phones if any. Though Index might fail.
                        customers.push(c);
                    }
                }
                else if (currentTable === 'attributes') {
                    const a = new Attribute();
                    a.id = new ObjectId();
                    a.name = getVal(row, 'attribute_type') || "";
                    const valuesStr = getVal(row, 'value') || "";
                    a.values = valuesStr.split(',').map((v: string) => ({ _id: new ObjectId(), name: v.trim(), isFilter: false }));
                    a.status = true;
                    a.isDelete = 0;
                    a.createdAt = getVal(row, 'created_at') ? new Date(getVal(row, 'created_at') as string) : new Date();
                    a.updatedAt = getVal(row, 'updated_at') ? new Date(getVal(row, 'updated_at') as string) : new Date();
                    attributes.push(a);

                    attributeLookup[a.name] = { id: a.id, values: {}, entity: a };
                    a.values.forEach(v => {
                        attributeLookup[a.name].values[v.name] = v._id!;
                    });
                }
                else if (currentTable === 'categories') {
                    const isParent = getVal(row, 'is_parent') === '0'; // Based on our finding, is_parent=0 means it's a parent if parent_id is NULL. Wait, let's just use parent_id.
                    const parentId = getVal(row, 'parent_id');
                    const mysqlId = getVal(row, 'id') || "";
                    const name = getVal(row, 'title') || "";
                    const slug = getVal(row, 'slug') || "";
                    const status = getVal(row, 'status') === 'active';
                    const description = getVal(row, 'description') || "";
                    const metaTitle = getVal(row, 'met_title') || "";
                    const metaDescription = getVal(row, 'met_description') || "";
                    const displayOrder = parseInt(getVal(row, 'headerorder') || "0") || 0;
                    const photoPath = getVal(row, 'photo') || "";

                    const image = photoPath ? { path: photoPath, fileName: photoPath.split('/').pop() } : undefined;

                    if (!parentId || parentId === 'NULL') {
                        // It's a category
                        const cat = new Category();
                        cat.id = new ObjectId();
                        categoryMap[mysqlId] = cat.id;
                        cat.name = name;
                        cat.slug = slug;
                        cat.description = description;
                        cat.status = status;
                        cat.metaTitle = metaTitle;
                        cat.metaDescription = metaDescription;
                        cat.displayOrder = displayOrder;
                        cat.image = image;
                        cat.createdAt = getVal(row, 'created_at') ? new Date(getVal(row, 'created_at') as string) : new Date();
                        cat.updatedAt = getVal(row, 'updated_at') ? new Date(getVal(row, 'updated_at') as string) : new Date();
                        cat.isDelete = 0;
                        categories.push(cat);
                    } else {
                        // It's a subcategory
                        const sub = new SubCategory();
                        sub.id = new ObjectId();
                        subCategoryMap[mysqlId] = sub.id;
                        
                        // We'll set the categoryId later after we build the category map
                        // But wait! We have the mysql parentId as a string.
                        // Let's store the old parentId temporarily in the object, or just map it if we can.
                        // Since categories might not be in order, we will temporarily store the old parentId in `metaKeywords` just to hold it, 
                        // then fix it up before DB insert.
                        sub.categoryId = parentId as unknown as ObjectId; // Hacker-ish, will fix up before insert
                        
                        sub.name = name;
                        sub.slug = slug;
                        sub.description = description;
                        sub.status = status;
                        sub.metaTitle = metaTitle;
                        sub.metaDescription = metaDescription;
                        sub.displayOrder = displayOrder;
                        sub.image = image;
                        sub.createdAt = getVal(row, 'created_at') ? new Date(getVal(row, 'created_at') as string) : new Date();
                        sub.updatedAt = getVal(row, 'updated_at') ? new Date(getVal(row, 'updated_at') as string) : new Date();
                        sub.isDelete = 0;
                        subCategories.push(sub);
                    }
                }
                else if (currentTable === 'product_attributes') {
                    const pa_product_id = getVal(row, 'product_id');
                    const attrName = getVal(row, 'attribute_name') || "";
                    const attrValStr = getVal(row, 'attribute_value') || "";
                    
                    if (pa_product_id) {
                        if (!productAttributesMap[pa_product_id as string]) {
                            productAttributesMap[pa_product_id as string] = [];
                        }
                        productAttributesMap[pa_product_id as string].push({
                            attributeName: attrName,
                            attributeValue: attrValStr
                        });
                    }
                }
                else if (currentTable === 'products') {
                    const p = new Product();
                    p.id = new ObjectId();
                    const mysqlId = getVal(row, 'id') as string;
                    productMysqlIdMap[mysqlId] = p;

                    const regPrice = parseFloat(getVal(row, 'regular_price') || "0") || 0;
                    const discount = parseFloat(getVal(row, 'discount') || "0") || 0;
                    const discountType = getVal(row, 'discount_type');
                    let salePrice = regPrice;
                    if (discount > 0) {
                        if (discountType === 'percentage') {
                            salePrice = regPrice - (regPrice * discount / 100);
                        } else {
                            salePrice = regPrice - discount;
                        }
                    }

                    p.name = getVal(row, 'name') || "";
                    p.slug = getVal(row, 'slug') || "";
                    p.hsnCode = getVal(row, 'hsn_code') || "";
                    p.fullDescription = getVal(row, 'description') || "";
                    p.status = getVal(row, 'status') === 'active';
                    p.price = salePrice;
                    
                    productStockMap[mysqlId] = parseInt(getVal(row, 'stock') || "0") || 0;
                    
                    // Temporarily store mysql ids
                    p.categoryId = getVal(row, 'category') as unknown as ObjectId;
                    p.subCategoryId = getVal(row, 'subcategory_id') as unknown as ObjectId;

                    p.createdAt = getVal(row, 'created_at') ? new Date(getVal(row, 'created_at') as string) : new Date();
                    p.updatedAt = getVal(row, 'updated_at') ? new Date(getVal(row, 'updated_at') as string) : new Date();
                    p.isDelete = getVal(row, 'deleted_at') && getVal(row, 'deleted_at') !== 'NULL' ? 1 : 0;
                    products.push(p);
                }
            } catch (e) {
                console.error("Error parsing row for table length:", currentTable, e);
            }

            if (line.trim().endsWith(';')) {
                currentTable = null;
            }
        }
    }

    console.log("SQL File parsed successfully!");

    // Fix up relationships
    console.log("Fixing up relationships...");
    for (const sub of subCategories) {
        const oldParentId = sub.categoryId as unknown as string;
        sub.categoryId = categoryMap[oldParentId] || null;
    }

    for (const mysqlId in productMysqlIdMap) {
        const p = productMysqlIdMap[mysqlId];
        const oldCatId = p.categoryId as unknown as string;
        const oldSubCatId = p.subCategoryId as unknown as string;
        
        p.categoryId = categoryMap[oldCatId] || null;
        p.subCategoryId = subCategoryMap[oldSubCatId] || null;
        
        // attach attributes
        if (productAttributesMap[mysqlId] && productAttributesMap[mysqlId].length > 0) {
            const variants: any[] = [];
            // generate variants for each attribute value. For simplicity, assume 1 attribute per product in SQL (e.g., SIZE).
            for (const pattr of productAttributesMap[mysqlId]) {
                const attrName = pattr.attributeName;
                const vals = pattr.attributeValue.split(',').map((v: string) => v.trim()).filter((v: string) => v);
                
                // Make sure attributeName exists in our dict
                if (!attributeLookup[attrName]) {
                    const newId = new ObjectId();
                    const newAttr = new Attribute();
                    newAttr.id = newId;
                    newAttr.name = attrName;
                    newAttr.values = [];
                    newAttr.status = true;
                    attributeLookup[attrName] = { id: newId, values: {}, entity: newAttr };
                    attributes.push(newAttr);
                }

                const attrDict = attributeLookup[attrName];
                for (const v of vals) {
                    if (!attrDict.values[v]) {
                        const vId = new ObjectId();
                        attrDict.values[v] = vId;
                        attrDict.entity.values.push({ _id: vId, name: v, isFilter: false });
                    }

                    variants.push({
                        sku: `${mysqlId}-${attrName}-${v}`.substring(0, 20),
                        mrp: p.price,
                        price: p.price,
                        stock: productStockMap[mysqlId] || 0,
                        combination: [
                            {
                                attributeId: attrDict.id,
                                valueId: attrDict.values[v],
                                value: v
                            }
                        ],
                        images: []
                    });
                }
            }
            p.attributes = variants;
        } else {
            p.attributes = [];
        }
    }

    // Filter duplicate customers by phoneNumber due to guest table possibly having dupes
    const uniqueCustomers: Customer[] = [];
    const phoneSet = new Set<string>();
    for (const c of customers) {
        if (!c.phoneNumber || phoneSet.has(c.phoneNumber)) continue;
        phoneSet.add(c.phoneNumber);
        uniqueCustomers.push(c);
    }
    
    console.log(`Inserting ${uniqueCustomers.length} Customers...`);
    const customerRepo = AppDataSource.getMongoRepository(Customer);
    await customerRepo.deleteMany({});
    if (uniqueCustomers.length > 0) await customerRepo.insertMany(uniqueCustomers);

    console.log(`Inserting ${attributes.length} Attributes...`);
    const attributeRepo = AppDataSource.getMongoRepository(Attribute);
    await attributeRepo.deleteMany({});
    if (attributes.length > 0) await attributeRepo.insertMany(attributes);

    console.log(`Inserting ${categories.length} Categories...`);
    const categoryRepo = AppDataSource.getMongoRepository(Category);
    await categoryRepo.deleteMany({});
    if (categories.length > 0) await categoryRepo.insertMany(categories);

    console.log(`Inserting ${subCategories.length} SubCategories...`);
    const subCategoryRepo = AppDataSource.getMongoRepository(SubCategory);
    await subCategoryRepo.deleteMany({});
    if (subCategories.length > 0) await subCategoryRepo.insertMany(subCategories);

    console.log(`Inserting ${products.length} Products...`);
    const productRepo = AppDataSource.getMongoRepository(Product);
    await productRepo.deleteMany({});
    if (products.length > 0) await productRepo.insertMany(products);

    console.log("Migration completed successfully!");
    process.exit(0);
}

run().catch(err => {
    console.error("Migration failed:", err);
    process.exit(1);
});
