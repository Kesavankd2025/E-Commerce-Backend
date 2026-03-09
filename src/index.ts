import "reflect-metadata";
import express from "express";
import cors from "cors";
import { useExpressServer } from "routing-controllers";
import { AppDataSource } from "./data-source";
import fileUpload from "express-fileupload";

import { seedDefaultAdmin } from "./seed/admin";
import { seedDefaultModules } from "./seed/modules";
import { seedPoints } from "./seed/points";
import { seedVerticalDirectors } from "./seed/vertical-directors";
import { seedChapterBadges } from "./seed/chapter.badges";

import "./cron/attendance.cron";
import "./cron/membership.cron";
import "./cron/expiry-sms.cron";

AppDataSource.initialize()
  .then(async () => {

    console.log("✅ Database connected");

    await seedDefaultAdmin();
    await seedDefaultModules();
    await seedPoints();
    await seedVerticalDirectors();
    await seedChapterBadges();

    const app = express();



    app.use(
      cors({
        origin: "*",
        methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
        allowedHeaders: ["Origin", "Content-Type", "Authorization"],
        credentials: true
      })
    );

    app.use(
      fileUpload({
        limits: { fileSize: 10 * 1024 * 1024 },
        abortOnLimit: true,
        useTempFiles: false
      })
    );
    app.use("/public", express.static("public"));

    const isProd = process.env.NODE_ENV === "prod";
    useExpressServer(app, {
      routePrefix: "/api/admin",
      controllers: [
        isProd
          ? __dirname + "/controllers/admin/**/*.js"
          : __dirname + "/controllers/admin/**/*.ts"
      ],
      middlewares: [
        isProd
          ? __dirname + "/middlewares/**/*.js"
          : __dirname + "/middlewares/**/*.ts"
      ],
      defaultErrorHandler: false,
      validation: true,
      classTransformer: true,

    });

    useExpressServer(app, {
      routePrefix: "/api/mobile",
      controllers: [
        isProd
          ? __dirname + "/controllers/mobile/**/*.js"
          : __dirname + "/controllers/mobile/**/*.ts"
      ],
      middlewares: [
        isProd
          ? __dirname + "/middlewares/**/*.js"
          : __dirname + "/middlewares/**/*.ts"
      ],
      defaultErrorHandler: false,
      validation: true,
      classTransformer: true,
    });

    useExpressServer(app, {
      routePrefix: "/api/website",
      controllers: [
        isProd
          ? __dirname + "/controllers/website/**/*.js"
          : __dirname + "/controllers/website/**/*.ts"
      ],
      middlewares: [
        isProd
          ? __dirname + "/middlewares/**/*.js"
          : __dirname + "/middlewares/**/*.ts"
      ],
      defaultErrorHandler: false,
      validation: true,
      classTransformer: true,
    });

    app.get("/", (_req, res) => {
      res.status(200).json({
        status: "ok",
        timestamp: new Date().toISOString(),
        database: AppDataSource.isInitialized ? "connected" : "disconnected",
        nodeVersion: process.version,
        uptime: process.uptime()
      });
    });

    app.use((err, _req, res, _next) => {
      console.error(err);
      res.status(err.httpCode || 500).json({
        message: err.message,
        errors: err.errors || null
      });
    });

    const PORT = process.env.PORT || 4000;

    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });

  })
  .catch((error) => {
    console.error("❌ DB Error:", error);
  });
