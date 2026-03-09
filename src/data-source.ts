import { DataSource } from "typeorm";
import dotenv from "dotenv";
import dns from "node:dns/promises";
dns.setServers(["8.8.8.8", "1.1.1.1"]);


dotenv.config({ quiet: true });

const isProd = process.env.NODE_ENV === "prod";

export const AppDataSource = new DataSource({
    type: "mongodb",
    url: process.env.MONGO_URI || "",
    synchronize: false,
    logging: !isProd,

    entities: [
        isProd
            ? __dirname + "/entity/**/*.js"
            : "src/entity/**/*.ts"
    ],

    // useUnifiedTopology: true,
});
