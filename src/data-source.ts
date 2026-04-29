import { DataSource } from "typeorm";
import dotenv from "dotenv";
import dns from "node:dns/promises";
dns.setServers(["8.8.8.8", "1.1.1.1"]);


dotenv.config({ quiet: true });

const isProd = process.env.NODE_ENV === "prod";

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/Prrayasha-collection-Dev";
const DB_URL = "mongodb://localhost:27017";
const DB_NAME = "Prrayasha-collection-Dev";


export const AppDataSource = new DataSource({
    type: "mongodb",
    url: MONGO_URI || "",
    synchronize: false,
    logging: !isProd,

    entities: [
        isProd
            ? __dirname + "/entity/**/*.js"
            : "src/entity/**/*.ts"
    ],

    // useUnifiedTopology: true,
});
