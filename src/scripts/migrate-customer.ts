import { AppDataSource } from "../data-source";
import { Customer } from "../entity/Customer";
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
    
    const customers: Customer[] = [];

    // Helper to get column index from current table
    const getVal = (row: any[], colName: string) => {
        const idx = currentColumns.indexOf(colName);
        return idx !== -1 ? row[idx] : null;
    };

    console.log("Parsing SQL Dump for Customers...");
    let lineCount = 0;
    
    for await (const line of rl) {
        lineCount++;
        if (lineCount % 50000 === 0) console.log(`Parsed ${lineCount} lines...`);
        
        const insertMatch = line.match(/INSERT INTO \`([^\`]+)\` \((.+?)\) VALUES/);
        if (insertMatch) {
            currentTable = insertMatch[1];
            currentColumns = insertMatch[2].split(',').map(c => c.trim().replace(/\`/g, ''));
            continue;
        }

        if (currentTable && line.trim().startsWith('(')) {
            const row = parseSqlTuple(line);
            
            try {
                if (currentTable === 'users') {
                    const role = getVal(row, 'role');
                    if (role !== 'admin') { // Avoid migrating admins into customer if any exists
                        const c = new Customer();
                        c.fullName = getVal(row, 'name') || "";
                        c.phoneNumber = getVal(row, 'phone') || "";
                        c.email = getVal(row, 'email') || "";
                        c.password = getVal(row, 'password') || "";
                        c.address = getVal(row, 'address') || "";
                        c.userType = role === 'customer' || c.password ? "registered" : "guest";
                        c.isActive = getVal(row, 'status') === 'active';
                        c.isDelete = 0;
                        c.createdAt = getVal(row, 'created_at') ? new Date(getVal(row, 'created_at') as string) : new Date();
                        c.updatedAt = getVal(row, 'updated_at') ? new Date(getVal(row, 'updated_at') as string) : new Date();
                        customers.push(c);
                    }
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
            } catch (e) {
                console.error("Error parsing row for table:", currentTable, e);
            }

            if (line.trim().endsWith(';')) {
                currentTable = null;
            }
        }
    }

    console.log("SQL File parsed successfully!");

    // Filter duplicate customers by phoneNumber due to guest table possibly having dupes
    const uniqueCustomers: Customer[] = [];
    const phoneSet = new Set<string>();
    
    // Process registered customers first, so they take precedence over guest accounts with the same phone
    const registeredCustomers = customers.filter(c => c.userType === 'registered');
    const guestCustomers = customers.filter(c => c.userType === 'guest');

    for (const c of registeredCustomers) {
        if (!c.phoneNumber || phoneSet.has(c.phoneNumber)) continue;
        phoneSet.add(c.phoneNumber);
        uniqueCustomers.push(c);
    }
    
    for (const c of guestCustomers) {
        if (!c.phoneNumber || phoneSet.has(c.phoneNumber)) continue;
        phoneSet.add(c.phoneNumber);
        uniqueCustomers.push(c);
    }
    
    console.log(`Inserting ${uniqueCustomers.length} Customers...`);
    const customerRepo = AppDataSource.getMongoRepository(Customer);
    
    // Clear existing customers
    await customerRepo.deleteMany({});
    
    // Insert in batches to avoid document size limits
    const batchSize = 1000;
    for (let i = 0; i < uniqueCustomers.length; i += batchSize) {
        const batch = uniqueCustomers.slice(i, i + batchSize);
        await customerRepo.insertMany(batch);
        console.log(`Inserted batch ${i / batchSize + 1}`);
    }

    console.log("Customer migration completed successfully!");
    process.exit(0);
}

run().catch(err => {
    console.error("Migration failed:", err);
    process.exit(1);
});
