import {
  JsonController,
  Get,
  Res,
  QueryParams,
  UseBefore,
  Req,
  Param
} from "routing-controllers";
import { Response } from "express";
import { AppDataSource } from "../../data-source";
import { AuthMiddleware, AuthPayload } from "../../middlewares/AuthMiddleware";
import pagination from "../../utils/pagination";
import response from "../../utils/response";
import { StatusCodes } from "http-status-codes";
import { ObjectId } from "mongodb";

import { OneToOneMeeting } from "../../entity/121's";
import { Referral } from "../../entity/Referral";
import { Visitor } from "../../entity/Visitor";
import { MobileChiefGuest } from "../../entity/MobileChiefGuest";
import { PowerDate } from "../../entity/PowerDate";
import { Training } from "../../entity/Training";
import { UserPoints } from "../../entity/UserPoints";
import { UserPointHistory } from "../../entity/UserPointHistory";
import { ThankYouSlip } from "../../entity/ThankyouSlip";
import { Chapter } from "../../entity/Chapter";
import { Member } from "../../entity/Member";
import { MeetingChiefGuest } from "../../entity/MeetingChiefGuest";
import { Parser } from "json2csv";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import path from "path";
import fs from "fs";
import { MemberSuggestion } from "../../entity/MemberSuggestion";
import { TrainingParticipants } from "../../entity/TrainingParticipants";
import { Attendance } from "../../entity/Attendance";

interface RequestWithUser extends Request {
  query: any;
  user: AuthPayload;
}
@JsonController("/reports")
export class ReportController {

  private oneToOneRepo =
    AppDataSource.getMongoRepository(OneToOneMeeting);

  private referralRepo =
    AppDataSource.getMongoRepository(Referral);
  private chiefGuestRepo =
    AppDataSource.getMongoRepository(MobileChiefGuest);
  private powerDateRepo =
    AppDataSource.getMongoRepository(PowerDate);
  private trainingRepo =
    AppDataSource.getMongoRepository(Training);
  private thankYouRepo =
    AppDataSource.getMongoRepository(ThankYouSlip);
  private memberRepo =
    AppDataSource.getMongoRepository(Member);
  private meetingChiefGuestRepo =
    AppDataSource.getMongoRepository(MeetingChiefGuest);
  private trainingParticipantsRepo =
    AppDataSource.getMongoRepository(TrainingParticipants);
  private attendanceRepository = AppDataSource.getMongoRepository(Attendance);
  private chapterRepo = AppDataSource.getMongoRepository(Chapter);

  private readonly pdfColors = {
    navyBlue: "#1B3A5C",
    red: "#E8611A",
    navyLight: "#E8EEF4",
    redLight: "#FDE8DC",
    text: "#1f2937",
    textLight: "#6b7280",
    rowAlt: "#f9fafb",
    white: "#ffffff"
  };

  private readonly orgName = "CNI Business Forum";

  private repo =
    AppDataSource.getMongoRepository(MemberSuggestion);

  private formatDateTime(date: Date): string {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true
    }).format(date);
  }

  private formatDateOnly(dateString: string): string {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    }).format(date);
  }

  @Get("/one-to-one-report")
  async getOneToOneReport(@QueryParams() query: any, @Res() res: Response) {
    try {
      const page = Number(query.page ?? 0);
      const limit = Number(query.limit ?? 10);
      const search = query.search?.trim();

      const match: any = {
        isDelete: 0,
      };

      const pipeline: any[] = [
        { $match: match },

        {
          $lookup: {
            from: "member",
            let: { memberId: "$createdBy" },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ["$_id", "$$memberId"] }
                }
              },
              { $project: { _id: 1, fullName: 1, chapter: 1 } },
            ],
            as: "member"
          }
        },
        { $unwind: { path: "$member", preserveNullAndEmptyArrays: true } },

        {
          $lookup: {
            from: "chapters",
            localField: "member.chapter",
            foreignField: "_id",
            as: "chapter",
          },
        },
        { $unwind: { path: "$chapter", preserveNullAndEmptyArrays: true } },

        ...(query.chapterId && ObjectId.isValid(query.chapterId)
          ? [{ $match: { "chapter._id": new ObjectId(query.chapterId) } }]
          : []),

        ...(query.zoneId && ObjectId.isValid(query.zoneId)
          ? [{ $match: { "chapter.zoneId": new ObjectId(query.zoneId) } }]
          : []),

        ...(query.edId && ObjectId.isValid(query.edId)
          ? [{ $match: { "chapter.edId": new ObjectId(query.edId) } }]
          : []),

        ...(query.rdId && ObjectId.isValid(query.rdId)
          ? [{ $match: { "chapter.rdId": new ObjectId(query.rdId) } }]
          : []),

        {
          $lookup: {
            from: "member",
            let: { metWithId: "$meetingWithMemberId" },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ["$_id", "$$metWithId"] },
                },
              },
              { $project: { _id: 1, fullName: 1 } },
            ],
            as: "metWith",
          },
        },
        { $unwind: { path: "$metWith", preserveNullAndEmptyArrays: true } },

        ...(search
          ? [
            {
              $match: {
                $or: [
                  { "member.fullName": { $regex: search, $options: "i" } },
                  { "metWith.fullName": { $regex: search, $options: "i" } },
                ],
              },
            },
          ]
          : []),

        { $sort: { meetingDateTime: -1 } },

        {
          $project: {
            _id: 1,
            meetingDateTime: 1,
            initiatedBy: 1,
            meetingLocation: 1,
            topicDiscussed: 1,
            photos: 1,

            memberName: "$member.fullName",
            metWithName: "$metWith.fullName",
            chapterName: "$chapter.chapterName",
            chapterId: "$chapter._id",
          },
        },
      ];

      const countPipeline = [...pipeline, { $count: "total" }];

      if (limit > 0) {
        pipeline.push({ $skip: page * limit }, { $limit: limit });
      }

      const data = await this.oneToOneRepo.aggregate(pipeline).toArray();
      const countResult = await this.oneToOneRepo
        .aggregate(countPipeline)
        .toArray();
      const totalCount = countResult.length > 0 ? countResult[0].total : 0;

      return pagination(totalCount, data, limit, page, res);
    } catch (error) {
      console.error(error);
      return response(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        "Failed to fetch 121 report",
      );
    }
  }
  @Get("/one-to-one-report/export")
  async exportOneToOne(
    @QueryParams() query: any,
    @Res() res: Response
  ): Promise<Response | void> {
    try {
      const { fromDate, toDate, format = "csv" } = query;

      if (!fromDate || !toDate) {
        return res.status(400).json({
          success: false,
          message: "fromDate and toDate are required"
        });
      }

      const start = new Date(`${fromDate}T00:00:00+05:30`);
      const end = new Date(`${toDate}T23:59:59.999+05:30`);

      if (start > end) {
        return res.status(400).json({
          success: false,
          message: "fromDate cannot be greater than toDate"
        });
      }

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Invalid date format"
        });
      }

      const generatedAtText = `Report Generated at: ${this.formatDateTime(new Date())}`;

      const search = query.search?.trim();

      const match: any = {
        isDelete: 0,
        meetingDateTime: { $gte: start, $lte: end }
      };

      const pipeline: any[] = [
        { $match: match },

        {
          $lookup: {
            from: "member",
            let: { memberId: "$createdBy" },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ["$_id", "$$memberId"] }
                }
              },
              { $project: { _id: 1, fullName: 1, chapter: 1 } },
            ],
            as: "member"
          }
        },
        { $unwind: { path: "$member", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "chapters",
            localField: "member.chapter",
            foreignField: "_id",
            as: "chapter",
          },
        },
        { $unwind: { path: "$chapter", preserveNullAndEmptyArrays: true } },

        ...(query.chapterId && ObjectId.isValid(query.chapterId)
          ? [{ $match: { "chapter._id": new ObjectId(query.chapterId) } }]
          : []),

        ...(query.zoneId && ObjectId.isValid(query.zoneId)
          ? [{ $match: { "chapter.zoneId": new ObjectId(query.zoneId) } }]
          : []),

        ...(query.edId && ObjectId.isValid(query.edId)
          ? [{ $match: { "chapter.edId": new ObjectId(query.edId) } }]
          : []),

        ...(query.rdId && ObjectId.isValid(query.rdId)
          ? [{ $match: { "chapter.rdId": new ObjectId(query.rdId) } }]
          : []),
        {
          $lookup: {
            from: "member",
            let: { metWithId: "$meetingWithMemberId" },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ["$_id", "$$metWithId"] },
                },
              },
              { $project: { _id: 1, fullName: 1 } },
            ],
            as: "metWith",
          },
        },
        { $unwind: { path: "$metWith", preserveNullAndEmptyArrays: true } },

        ...(search
          ? [
            {
              $match: {
                $or: [
                  { "member.fullName": { $regex: search, $options: "i" } },
                  { "metWith.fullName": { $regex: search, $options: "i" } },
                ],
              },
            },
          ]
          : []),

        { $sort: { meetingDateTime: -1 } },

        {
          $project: {
            meetingDateTime: 1,
            memberName: "$member.fullName",
            metWithName: "$metWith.fullName",
            location: "$meetingLocation",
            topics: "$topicDiscussed",
            initiatedBy: 1,
            photos: 1,
            chapterName: "$chapter.chapterName",
          },
        },
        {
          $sort: {
            meetingDateTime: -1
          }
        }
      ];

      const cursor = this.oneToOneRepo.aggregate(pipeline);



      if (format === "pdf") {
        const doc = new PDFDocument({ size: "A4", margin: 30 });

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          "attachment; filename=one_to_one_report.pdf"
        );

        doc.pipe(res);

        const logoPath = path.resolve(process.cwd(), "uploads", "logo.png");




        const pageWidth = doc.page.width;
        const pageHeight = doc.page.height;
        const margin = 30;
        const contentWidth = pageWidth - margin * 2;

        const HEADER_Y = 145;
        const TABLE_HEADER_HEIGHT = 38;
        const FOOTER_Y = pageHeight - 85;


        const drawHeader = () => {
          if (fs.existsSync(logoPath)) {
            doc.image(logoPath, margin, 35, { width: 65 });
          }

          doc.font("Helvetica-Bold").fontSize(22).fillColor(this.pdfColors.navyBlue);
          doc.text(this.orgName, margin + 80, 42);

          doc.fontSize(14).fillColor(this.pdfColors.red);
          doc.text("One-to-One Meeting Report", margin + 80, 66);

          const boxX = pageWidth - margin - 185;
          const boxY = 38;

          doc
            .roundedRect(boxX, boxY, 185, 58, 6)
            .fillAndStroke(this.pdfColors.navyLight, this.pdfColors.navyBlue);

          doc.fontSize(10).fillColor(this.pdfColors.navyBlue);
          doc.text("Report Period", boxX + 12, boxY + 10);

          doc.fontSize(9).fillColor(this.pdfColors.text);
          doc.text(`From:  ${this.formatDateOnly(fromDate)}`, boxX + 12, boxY + 26);
          doc.text(`To : ${this.formatDateOnly(toDate)}`, boxX + 12, boxY + 38);

          doc
            .font("Helvetica")
            .fontSize(7)
            .fillColor(this.pdfColors.textLight)
            .text(generatedAtText, margin, 110);

          doc.strokeColor(this.pdfColors.navyBlue).lineWidth(2.5)
            .moveTo(margin, 125)
            .lineTo(pageWidth - margin, 125)
            .stroke();

          doc.strokeColor(this.pdfColors.red).lineWidth(1)
            .moveTo(margin, 128)
            .lineTo(pageWidth - margin, 128)
            .stroke();
        };


        const drawTableHeader = (y: number) => {
          doc.rect(margin, y, contentWidth, 30).fill(this.pdfColors.navyBlue);
          doc.rect(margin, y, contentWidth, 3).fill(this.pdfColors.red);

          const columns = [
            { text: "S.No", x: margin + 10, width: 30 },
            { text: "Date & Time", x: margin + 45, width: 90 },
            { text: "Member", x: margin + 140, width: 85 },
            { text: "Met With", x: margin + 230, width: 85 },
            { text: "Location", x: margin + 320, width: 80 },
            { text: "Topic Discussed", x: margin + 405, width: 90 }
          ];

          doc.font("Helvetica-Bold").fontSize(9).fillColor(this.pdfColors.white);
          columns.forEach(col =>
            doc.text(col.text, col.x, y + 10, { width: col.width, align: "left" })
          );
        };


        const drawRow = (y: number, index: number, row: any, alt: boolean, rowHeight: number) => {
          if (alt) {
            doc.rect(margin, y - 3, contentWidth, rowHeight).fill(this.pdfColors.rowAlt);
          }

          const getCenteredY = (text: string, width: number) => {
            const h = doc.heightOfString(text || "-", { width });
            return y + (rowHeight - h) / 2 - 2; // Offset slightly for visual balance
          };

          doc.font("Helvetica").fontSize(9).fillColor(this.pdfColors.text);
          doc.text(String(index), margin + 10, getCenteredY(String(index), 30), { width: 30, align: "left" });

          const meetingDate = this.formatDateTime(row.meetingDateTime);
          doc.text(meetingDate, margin + 45, getCenteredY(meetingDate, 90), { width: 90, lineBreak: true, align: "left" });
          doc.text(row.memberName || "-", margin + 140, getCenteredY(row.memberName, 85), { width: 85, lineBreak: true, align: "left" });
          doc.text(row.metWithName || "-", margin + 230, getCenteredY(row.metWithName, 85), { width: 85, lineBreak: true, align: "left" });
          doc.text(row.location || "-", margin + 320, getCenteredY(row.location, 80), { width: 80, lineBreak: true, align: "left" });
          doc.text(row.topics || "-", margin + 405, getCenteredY(row.topics, 90), { width: 90, lineBreak: true, align: "left" });
        };


        const drawFooter = (pageNum: number, total: number) => {
          doc.strokeColor(this.pdfColors.navyBlue).lineWidth(1)
            .moveTo(margin, FOOTER_Y)
            .lineTo(pageWidth - margin, FOOTER_Y)
            .stroke();

          doc.strokeColor(this.pdfColors.red).lineWidth(0.5)
            .moveTo(margin, FOOTER_Y + 2)
            .lineTo(pageWidth - margin, FOOTER_Y + 2)
            .stroke();

          doc.fontSize(8).fillColor(this.pdfColors.textLight);
          doc.fontSize(8).fillColor(this.pdfColors.textLight);
          doc.text(
            `Page ${pageNum} of ${total}`,
            margin,
            FOOTER_Y + 8,
            { align: "center" }
          );

          doc.font("Helvetica").fontSize(7).fillColor(this.pdfColors.navyBlue);
          const footerText = "Powered by: Ocean Softwares";
          const textWidth = doc.widthOfString(footerText);
          const startX = pageWidth - margin - textWidth - 5;
          doc.text("Powered by: ", startX, FOOTER_Y + 8, { continued: true, lineBreak: false, width: pageWidth - startX - margin })
            .text("Ocean Softwares", { link: "https://www.oceansoftwares.com/", underline: true, lineBreak: false });
        };

        const rows: any[] = [];
        for await (const r of cursor) rows.push(r);

        doc.font("Helvetica").fontSize(9);

        const rowHeights = rows.map(row => {
          const h1 = doc.heightOfString(this.formatDateTime(row.meetingDateTime), { width: 90 });
          const h2 = doc.heightOfString(row.memberName || "-", { width: 85 });
          const h3 = doc.heightOfString(row.metWithName || "-", { width: 85 });
          const h4 = doc.heightOfString(row.location || "-", { width: 80 });
          const h5 = doc.heightOfString(row.topics || "-", { width: 90 });
          return Math.max(h1, h2, h3, h4, h5, 20) + 10; // min 20 + 10 padding
        });

        let totalPages = 1;
        let tempY = HEADER_Y + TABLE_HEADER_HEIGHT;
        for (let i = 0; i < rows.length; i++) {
          if (tempY + rowHeights[i] > FOOTER_Y - 10) {
            totalPages++;
            tempY = HEADER_Y + TABLE_HEADER_HEIGHT;
          }
          tempY += rowHeights[i];
        }

        let pageNum = 1;
        let index = 1;
        let alt = false;
        let y = HEADER_Y;

        drawHeader();
        drawTableHeader(y);
        y += TABLE_HEADER_HEIGHT;

        for (let i = 0; i < rows.length; i++) {
          const rowHeight = rowHeights[i];

          if (y + rowHeight > FOOTER_Y - 10) {
            drawFooter(pageNum, totalPages);
            doc.addPage();
            pageNum++;

            drawHeader();
            y = HEADER_Y;
            drawTableHeader(y);
            y += TABLE_HEADER_HEIGHT;
            alt = false;
          }

          drawRow(y, index++, rows[i], alt, rowHeight);
          alt = !alt;
          y += rowHeight;
        }

        drawFooter(pageNum, totalPages);
        doc.end();
        return res;
      }


      if (format === "csv") {
        const dataRows: any[] = [];
        let index = 1;

        for await (const item of cursor) {
          dataRows.push({
            "S.No": index++,
            "Date & Time": this.formatDateTime(item.meetingDateTime),
            "Member Name": item.memberName,
            "Met with": item.metWithName,
            "Initiated by": item.initiatedBy || "-",
            "Location": item.location,
            "Topics": item.topics
          });
        }

        if (dataRows.length === 0) {
          return res.status(404).json({
            success: false,
            message: "No data found"
          });
        }

        const fields = ["S.No", "Date & Time", "Member Name", "Met with", "Initiated by", "Location", "Topics"];

        const parser = new Parser({ fields });
        const dataCsv = parser.parse(dataRows);

        const reportLine = `${generatedAtText}\n\n`;
        const csv = reportLine + dataCsv;

        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", "attachment; filename=one_to_one_report.csv");

        res.send(csv);
        return res;
      }

      if (format === "excel") {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet("One To One");

        sheet.addRow([generatedAtText]);
        sheet.mergeCells("A1:G1");
        sheet.getRow(1).font = { italic: true };
        sheet.addRow([]);

        sheet.columns = [
          { header: "S.No", key: "sno", width: 8 },
          { header: "Date & Time", key: "date", width: 20 },
          { header: "Member Name", key: "member", width: 25 },
          { header: "Met with", key: "metWith", width: 25 },
          { header: "Initiated by", key: "initiatedBy", width: 15 },
          { header: "Location", key: "location", width: 30 },
          { header: "Topics", key: "topics", width: 40 }
        ];

        let index = 1;

        for await (const item of cursor) {
          sheet.addRow({
            sno: index++,
            date: this.formatDateTime(item.meetingDateTime),
            member: item.memberName,
            metWith: item.metWithName,
            initiatedBy: item.initiatedBy || "-",
            location: item.location,
            topics: item.topics
          });
        }

        res.setHeader(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        res.setHeader(
          "Content-Disposition",
          "attachment; filename=one_to_one_report.xlsx"
        );

        await workbook.xlsx.write(res);
        res.end();
        return res;
      }

      return res.status(400).json({
        success: false,
        message: "Invalid format. Use csv | excel | pdf"
      });

    } catch (error) {
      console.error(error);

      if (res.headersSent) {
        return;
      }

      return res.status(500).json({
        success: false,
        message: "Failed to export report"
      });
    }
  }


  @Get("/referral-report")
  async getReferralReport(
    @QueryParams() query: any,
    @Res() res: Response
  ) {
    try {
      const page = Number(query.page ?? 0);
      const limit = Number(query.limit ?? 10);
      const search = query.search?.trim();

      const match = { isDelete: 0 };

      const pipeline: any[] = [
        { $match: match },

        {
          $lookup: {
            from: "member",
            let: { fromId: "$fromMemberId" },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ["$_id", "$$fromId"] }
                }
              },
              { $project: { _id: 1, fullName: 1, chapter: 1 } }
            ],
            as: "fromMember"
          }
        },
        { $unwind: "$fromMember" },

        {
          $lookup: {
            from: "chapters",
            localField: "fromMember.chapter",
            foreignField: "_id",
            as: "chapter"
          }
        },
        { $unwind: "$chapter" },

        ...(query.chapterId && ObjectId.isValid(query.chapterId)
          ? [{ $match: { "chapter._id": new ObjectId(query.chapterId) } }]
          : []),

        ...(query.zoneId && ObjectId.isValid(query.zoneId)
          ? [{ $match: { "chapter.zoneId": new ObjectId(query.zoneId) } }]
          : []),

        ...(query.edId && ObjectId.isValid(query.edId)
          ? [{ $match: { "chapter.edId": new ObjectId(query.edId) } }]
          : []),

        ...(query.rdId && ObjectId.isValid(query.rdId)
          ? [{ $match: { "chapter.rdId": new ObjectId(query.rdId) } }]
          : []),

        {
          $lookup: {
            from: "member",
            let: { toId: "$toMemberId" },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ["$_id", "$$toId"] }
                }
              },
              { $project: { _id: 1, fullName: 1 } }
            ],
            as: "toMember"
          }
        },
        { $unwind: { path: "$toMember", preserveNullAndEmptyArrays: true } },

        ...(search
          ? [{
            $match: {
              $or: [
                { "fromMember.fullName": { $regex: search, $options: "i" } },
                { "toMember.fullName": { $regex: search, $options: "i" } },
                { referralName: { $regex: search, $options: "i" } }
              ]
            }
          }]
          : []),

        { $sort: { createdAt: -1 } },

        {
          $project: {
            _id: 1,
            createdAt: 1,
            memberName: "$fromMember.fullName",
            referralTo: "$toMember.fullName",
            type: "$referralType",
            status: "$status",
            referralName: 1,
            telephone: 1,
            email: 1,
            address: 1,
            toldWouldCall: 1,
            givenCard: 1,
            comments: 1,
            temp: {
              $switch: {
                branches: [
                  { case: { $eq: ["$rating", 5] }, then: "Hot" },
                  { case: { $eq: ["$rating", 4] }, then: "High" },
                  { case: { $eq: ["$rating", 3] }, then: "Bright" },
                  { case: { $eq: ["$rating", 2] }, then: "Scope" },
                  { case: { $eq: ["$rating", 1] }, then: "Base" }
                ],
                default: "Unknown"
              }
            }
          }
        }
      ];

      const countPipeline = [...pipeline, { $count: "total" }];
      if (limit > 0) {
        pipeline.push({ $skip: page * limit }, { $limit: limit });
      }
      const [data, countResult] = await Promise.all([
        this.referralRepo.aggregate(pipeline).toArray(),
        this.referralRepo.aggregate(countPipeline).toArray()
      ]);

      const totalCount = countResult.length > 0 ? countResult[0].total : 0;

      return pagination(totalCount, data, limit, page, res);

    } catch (error) {
      console.error(error);
      return response(res, StatusCodes.INTERNAL_SERVER_ERROR,
        "Failed to fetch referral report");
    }
  }
  private formatDate(date: Date): string {
    if (!date) return "-";
    const d = new Date(date);
    return d.toLocaleDateString("en-GB");
  }

  @Get("/referral-report/export")
  async exportReferralReport(
    @QueryParams() query: any,
    @Res() res: Response
  ): Promise<Response | void> {
    try {
      const { fromDate, toDate, format = "csv" } = query;

      if (!fromDate || !toDate) {
        return res.status(400).json({
          success: false,
          message: "fromDate and toDate are required"
        });
      }

      const start = new Date(`${fromDate}T00:00:00+05:30`);
      const end = new Date(`${toDate}T23:59:59.999+05:30`);

      if (start > end) {
        return res.status(400).json({
          success: false,
          message: "fromDate cannot be greater than toDate"
        });
      }

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Invalid date format"
        });
      }

      const generatedAtText = `Report Generated at: ${this.formatDateTime(new Date())}`;

      const search = query.search?.trim();

      const match = { isDelete: 0, createdAt: { $gte: start, $lte: end } };

      const pipeline: any[] = [
        { $match: match },

        {
          $lookup: {
            from: "member",
            let: { fromId: "$fromMemberId" },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ["$_id", "$$fromId"] }
                }
              },
              { $project: { _id: 1, fullName: 1, chapter: 1 } }
            ],
            as: "fromMember"
          }
        },
        { $unwind: "$fromMember" },

        {
          $lookup: {
            from: "chapters",
            localField: "fromMember.chapter",
            foreignField: "_id",
            as: "chapter"
          }
        },
        { $unwind: "$chapter" },

        ...(query.chapterId && ObjectId.isValid(query.chapterId)
          ? [{ $match: { "chapter._id": new ObjectId(query.chapterId) } }]
          : []),

        ...(query.zoneId && ObjectId.isValid(query.zoneId)
          ? [{ $match: { "chapter.zoneId": new ObjectId(query.zoneId) } }]
          : []),

        ...(query.edId && ObjectId.isValid(query.edId)
          ? [{ $match: { "chapter.edId": new ObjectId(query.edId) } }]
          : []),

        ...(query.rdId && ObjectId.isValid(query.rdId)
          ? [{ $match: { "chapter.rdId": new ObjectId(query.rdId) } }]
          : []),

        {
          $lookup: {
            from: "member",
            let: { toId: "$toMemberId" },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ["$_id", "$$toId"] }
                }
              },
              { $project: { _id: 1, fullName: 1 } }
            ],
            as: "toMember"
          }
        },
        { $unwind: { path: "$toMember", preserveNullAndEmptyArrays: true } },

        ...(search
          ? [{
            $match: {
              $or: [
                { "fromMember.fullName": { $regex: search, $options: "i" } },
                { "toMember.fullName": { $regex: search, $options: "i" } },
                { referralName: { $regex: search, $options: "i" } }
              ]
            }
          }]
          : []),

        { $sort: { createdAt: -1 } },

        {
          $project: {
            _id: 1,
            createdAt: 1,
            memberName: "$fromMember.fullName",
            referralTo: "$toMember.fullName",
            type: "$referralType",
            status: "$status",
            referralName: 1,
            telephone: 1,
            email: 1,
            address: 1,
            toldWouldCall: 1,
            givenCard: 1,
            comments: 1,
            temp: {
              $switch: {
                branches: [
                  { case: { $eq: ["$rating", 5] }, then: "Hot" },
                  { case: { $eq: ["$rating", 4] }, then: "High" },
                  { case: { $eq: ["$rating", 3] }, then: "Bright" },
                  { case: { $eq: ["$rating", 2] }, then: "Scope" },
                  { case: { $eq: ["$rating", 1] }, then: "Base" }
                ],
                default: "Unknown"
              }
            }
          }
        }
      ];
      const cursor = this.referralRepo.aggregate(pipeline);

      if (format === "pdf") {
        const doc = new PDFDocument({ size: "A4", margin: 30 });

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          "attachment; filename=referral_report.pdf"
        );

        doc.pipe(res);

        const logoPath = path.resolve(process.cwd(), "uploads", "logo.png");


        const pageWidth = doc.page.width;
        const pageHeight = doc.page.height;
        const margin = 30;
        const contentWidth = pageWidth - margin * 2;

        const HEADER_Y = 120;
        const TABLE_HEADER_HEIGHT = 26;
        const FOOTER_Y = pageHeight - 85;

        const formatLabel = (value?: string) => {
          if (!value) return "-";
          return value
            .toLowerCase()
            .split("_")
            .map(v => v.charAt(0).toUpperCase() + v.slice(1))
            .join(" ");
        };

        const getTempStyle = (temp?: string) => {
          switch (temp) {
            case "Hot":
              return { bg: "#fee2e2", text: "#dc2626" };
            case "High":
              return { bg: "#fff7ed", text: "#c2410c" };
            case "Bright":
              return { bg: "#fef9c3", text: "#854d0e" };
            case "Scope":
              return { bg: "#dbeafe", text: "#1e40af" };
            case "Base":
              return { bg: "#f3e8ff", text: "#9333ea" };
            default:
              return { bg: "#f3f4f6", text: "#6b7280" };
          }
        };

        const drawHeader = () => {
          if (fs.existsSync(logoPath)) {
            doc.image(logoPath, margin, 35, { width: 65 });
          }

          doc.font("Helvetica-Bold").fontSize(22).fillColor(this.pdfColors.navyBlue);
          doc.text(this.orgName, margin + 80, 42);

          doc.fontSize(14).fillColor(this.pdfColors.red);
          doc.text("Referral Report", margin + 80, 66);

          const boxX = pageWidth - margin - 185;
          const boxY = 38;

          doc
            .roundedRect(boxX, boxY, 185, 58, 6)
            .fillAndStroke(this.pdfColors.navyLight, this.pdfColors.navyBlue);

          doc.fontSize(10).fillColor(this.pdfColors.navyBlue);
          doc.text("Report Period", boxX + 12, boxY + 10);

          doc.fontSize(9).fillColor(this.pdfColors.text);
          doc.text(`From:  ${this.formatDateOnly(fromDate)}`, boxX + 12, boxY + 26);
          doc.text(`To : ${this.formatDateOnly(toDate)}`, boxX + 12, boxY + 38);

          doc
            .font("Helvetica")
            .fontSize(7)
            .fillColor(this.pdfColors.textLight)
            .text(generatedAtText, margin, 110);

          doc.strokeColor(this.pdfColors.navyBlue).lineWidth(2.5)
            .moveTo(margin, 125)
            .lineTo(pageWidth - margin, 125)
            .stroke();

          doc.strokeColor(this.pdfColors.red).lineWidth(1)
            .moveTo(margin, 128)
            .lineTo(pageWidth - margin, 128)
            .stroke();
        };

        const drawTableHeader = (y: number) => {
          doc.rect(margin, y, contentWidth, TABLE_HEADER_HEIGHT).fill(this.pdfColors.navyBlue);
          doc.rect(margin, y, contentWidth, 2).fill(this.pdfColors.red);

          const columns = [
            { text: "S.No", x: margin + 8, width: 30 },
            { text: "Date", x: margin + 40, width: 80 },
            { text: "Member", x: margin + 125, width: 80 },
            { text: "Business Potential", x: margin + 210, width: 60 },
            { text: "Referral To", x: margin + 275, width: 95 },
            { text: "Type", x: margin + 375, width: 70 },
            { text: "Status", x: margin + 450, width: 100 }
          ];

          doc.font("Helvetica-Bold")
            .fontSize(9)
            .fillColor(this.pdfColors.white);

          columns.forEach(col =>
            doc.text(col.text, col.x, y + 7, { width: col.width, align: "left" })
          );
        };

        /* ---------------- ROW ---------------- */
        const drawRow = (y: number, index: number, row: any, alt: boolean, rowHeight: number) => {
          if (alt) {
            doc.rect(margin, y - 2, contentWidth, rowHeight).fill(this.pdfColors.rowAlt);
          }

          const getCenteredY = (text: string, width: number) => {
            const h = doc.heightOfString(text || "-", { width });
            return y + (rowHeight - h) / 2 - 2;
          };

          doc.font("Helvetica").fontSize(8).fillColor(this.pdfColors.text);
          doc.text(String(index), margin + 10, getCenteredY(String(index), 30), { width: 30, align: "left" });

          doc.font("Helvetica").fontSize(9).fillColor(this.pdfColors.text);

          const referralDate = this.formatDate(row.createdAt);
          doc.text(referralDate, margin + 40, getCenteredY(referralDate, 80), { width: 80, lineBreak: true, align: "left" });

          doc.text(row.memberName || "-", margin + 125, getCenteredY(row.memberName, 80), {
            width: 80,
            lineBreak: true, align: "left"
          });

          const tempStyle = getTempStyle(row.temp);
          const tempX = margin + 210;
          const tempWidth = 50;
          const tempY = getCenteredY(row.temp, tempWidth);

          doc.roundedRect(tempX, tempY - 3, tempWidth, 14, 4)
            .fill(tempStyle.bg);

          doc.font("Helvetica-Bold")
            .fontSize(8)
            .fillColor(tempStyle.text)
            .text(row.temp || "-", tempX, tempY, {
              width: tempWidth,
              align: "left"
            });

          doc.font("Helvetica").fontSize(9).fillColor(this.pdfColors.text);
          doc.text(row.referralTo || "-", margin + 275, getCenteredY(row.referralTo, 95), {
            width: 95,
            lineBreak: true, align: "left"
          });

          doc.text(formatLabel(row.type), margin + 375, getCenteredY(formatLabel(row.type), 70), { width: 70, lineBreak: true, align: "left" });

          doc.text(formatLabel(row.status), margin + 450, getCenteredY(formatLabel(row.status), 100), { width: 100, lineBreak: true, align: "left" });
        };
        const drawFooter = (pageNum: number, total: number) => {
          doc.strokeColor(this.pdfColors.navyBlue).lineWidth(1)
            .moveTo(margin, FOOTER_Y)
            .lineTo(pageWidth - margin, FOOTER_Y)
            .stroke();

          doc.strokeColor(this.pdfColors.red).lineWidth(0.5)
            .moveTo(margin, FOOTER_Y + 2)
            .lineTo(pageWidth - margin, FOOTER_Y + 2)
            .stroke();

          doc.fontSize(8)
            .fillColor(this.pdfColors.textLight)
            .text(`Page ${pageNum} of ${total}`, margin, FOOTER_Y + 8, {
              align: "center"
            });

          doc.font("Helvetica").fontSize(7).fillColor(this.pdfColors.navyBlue);
          const footerText = "Powered by: Ocean Softwares";
          const textWidth = doc.widthOfString(footerText);
          const startX = pageWidth - margin - textWidth - 5;
          doc.text("Powered by: ", startX, FOOTER_Y + 8, { continued: true, lineBreak: false, width: pageWidth - startX - margin })
            .text("Ocean Softwares", { link: "https://www.oceansoftwares.com/", underline: true, lineBreak: false });
        };

        const rows: any[] = [];
        for await (const r of cursor) rows.push(r);

        doc.font("Helvetica").fontSize(9);

        const rowHeights = rows.map(row => {
          const h1 = doc.heightOfString(row.memberName || "-", { width: 80 });
          const h2 = doc.heightOfString(row.referralTo || "-", { width: 95 });
          const h3 = doc.heightOfString(formatLabel(row.type), { width: 70 });
          const h4 = doc.heightOfString(formatLabel(row.status), { width: 100 });
          return Math.max(h1, h2, h3, h4, 15) + 12; // min height 15 + padding 12
        });

        let totalPages = 1;
        let tempY = HEADER_Y + TABLE_HEADER_HEIGHT;
        for (let i = 0; i < rows.length; i++) {
          if (tempY + rowHeights[i] > FOOTER_Y - 10) {
            totalPages++;
            tempY = HEADER_Y + TABLE_HEADER_HEIGHT;
          }
          tempY += rowHeights[i];
        }

        let pageNum = 1;
        let index = 1;
        let alt = false;
        let y = HEADER_Y;

        drawHeader();
        drawTableHeader(y);
        y += TABLE_HEADER_HEIGHT;

        for (let i = 0; i < rows.length; i++) {
          const rowHeight = rowHeights[i];

          if (y + rowHeight > FOOTER_Y - 10) {
            drawFooter(pageNum, totalPages);
            doc.addPage();
            pageNum++;

            drawHeader();
            y = HEADER_Y;
            drawTableHeader(y);
            y += TABLE_HEADER_HEIGHT;
            alt = false;
          }

          drawRow(y, index++, rows[i], alt, rowHeight);
          alt = !alt;
          y += rowHeight;
        }

        drawFooter(pageNum, totalPages);
        doc.end();
        return res;
      }



      if (format === "csv") {
        const rows: any[] = [];
        let index = 1;



        for await (const item of cursor) {
          rows.push({
            "S.No": index++,
            "Date": this.formatDate(item.createdAt),
            "Member Name": item.memberName,
            "Referral To": item.referralTo,
            "Type": item.type,
            "Status": item.status,
            "Referral Name": item.referralName,
            "Business Potential": item.temp,
            "Comments": item.comments
          });
        }

        if (rows.length === 0) {
          return res.status(404).json({ success: false, message: "No data found" });
        }

        const parser = new Parser();
        const dataCsv = parser.parse(rows);

        const reportLine = `"${generatedAtText}"\n\n`;
        const csv = reportLine + dataCsv;

        res.setHeader("Content-Type", "text/csv");
        res.setHeader(
          "Content-Disposition",
          "attachment; filename=referral_report.csv"
        );
        res.send(csv);
        return res;
      }

      /* ===================== EXCEL ===================== */
      if (format === "excel") {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet("Referral Report");

        sheet.addRow([generatedAtText]);
        sheet.mergeCells("A1:I1");
        sheet.getRow(1).font = { italic: true };
        sheet.addRow([]);

        sheet.columns = [
          { header: "S.No", key: "sno", width: 8 },
          { header: "Date", key: "date", width: 15 },
          { header: "Member Name", key: "memberName", width: 25 },
          { header: "Referral To", key: "referralTo", width: 25 },
          { header: "Type", key: "type", width: 12 },
          { header: "Status", key: "status", width: 18 },
          { header: "Referral Name", key: "referralName", width: 25 },
          { header: "Business Potential", key: "temp", width: 10 },
          { header: "Comments", key: "comments", width: 30 }
        ];

        let index = 1;
        for await (const item of cursor) {
          sheet.addRow({
            sno: index++,
            date: this.formatDate(item.createdAt),
            memberName: item.memberName,
            referralTo: item.referralTo,
            type: item.type,
            status: item.status,
            referralName: item.referralName,
            temp: item.temp,
            comments: item.comments
          });
        }

        res.setHeader(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        res.setHeader(
          "Content-Disposition",
          "attachment; filename=referral_report.xlsx"
        );

        await workbook.xlsx.write(res);
        res.end();
        return res;
      }

      return res.status(400).json({
        success: false,
        message: "Invalid format. Use csv | excel | pdf"
      });
    } catch (error) {
      console.error(error);
      if (!res.headersSent) {
        return res.status(500).json({
          success: false,
          message: "Failed to export referral report"
        });
      }
    }
  }

  @Get("/visitor-report")
  @UseBefore(AuthMiddleware)
  async getVisitorReport(
    @QueryParams() query: any,
    @Res() res: Response
  ) {
    try {
      const page = Number(query.page ?? 0);
      const limit = Number(query.limit ?? 10);
      const search = query.search?.trim();

      const match: any = {
        isDelete: 0
      };

      const pipeline: any[] = [
        { $match: match },

        {
          $lookup: {
            from: "member",
            let: { memberId: "$createdBy" },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ["$_id", "$$memberId"] }
                }
              },
              {
                $project: {
                  _id: 1,
                  fullName: 1,
                  chapter: 1
                }
              }
            ],
            as: "invitedBy"
          }
        },
        {
          $unwind: {
            path: "$invitedBy",
            preserveNullAndEmptyArrays: true
          }
        },
        {
          $lookup: {
            from: "chapters",
            localField: "chapterId",
            foreignField: "_id",
            as: "chapter"
          }
        },
        {
          $unwind: {
            path: "$chapter",
            preserveNullAndEmptyArrays: true
          }
        },

        ...(query.chapterId && ObjectId.isValid(query.chapterId)
          ? [{ $match: { "chapter._id": new ObjectId(query.chapterId) } }]
          : []),

        ...(query.zoneId && ObjectId.isValid(query.zoneId)
          ? [{ $match: { "chapter.zoneId": new ObjectId(query.zoneId) } }]
          : []),

        ...(query.edId && ObjectId.isValid(query.edId)
          ? [{ $match: { "chapter.edId": new ObjectId(query.edId) } }]
          : []),

        ...(query.rdId && ObjectId.isValid(query.rdId)
          ? [{ $match: { "chapter.rdId": new ObjectId(query.rdId) } }]
          : []),

        ...(search
          ? [{
            $match: {
              $or: [
                { visitorName: { $regex: search, $options: "i" } },
                { contactNumber: { $regex: search, $options: "i" } },
                { companyName: { $regex: search, $options: "i" } },
                { "invitedBy.fullName": { $regex: search, $options: "i" } },
                { businessCategory: { $regex: search, $options: "i" } }
              ]
            }
          }]
          : []),

        { $sort: { createdAt: -1 } },

        {
          $project: {
            _id: 1,
            date: "$createdAt",
            visitorName: 1,
            contactNumber: 1,
            businessCategory: 1,
            companyName: 1,
            sourceOfEvent: "$status",
            invitedBy: "$invitedBy.fullName",
            chapterId: "$chapter._id",
            chapterName: "$chapter.name"
          }
        }
      ];

      const visitorRepo = AppDataSource.getMongoRepository(Visitor);

      // Create a separate pipeline for counting with all filters applied
      const countPipeline = [...pipeline, { $count: "total" }];

      // Add pagination to the data pipeline
      if (limit > 0) {
        pipeline.push(
          { $skip: page * limit },
          { $limit: limit }
        );
      }

      // Execute both pipelines in parallel
      const [data, countResult] = await Promise.all([
        visitorRepo.aggregate(pipeline).toArray(),
        visitorRepo.aggregate(countPipeline).toArray()
      ]);

      const totalCount = countResult.length > 0 ? countResult[0].total : 0;

      return pagination(
        totalCount,
        data,
        limit,
        page,
        res
      );

    } catch (error) {
      console.error(error);
      return response(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        "Failed to fetch visitor report"
      );
    }
  }

  @Get("/visitor-report/export")
  async exportVisitor(
    @QueryParams() query: any,
    @Res() res: Response
  ): Promise<Response | void> {
    try {
      const { fromDate, toDate, format = "csv" } = query;

      if (!fromDate || !toDate) {
        return res.status(400).json({
          success: false,
          message: "fromDate and toDate are required"
        });
      }

      const start = new Date(`${fromDate}T00:00:00+05:30`);
      const end = new Date(`${toDate}T23:59:59.999+05:30`);
      if (start > end) {
        return res.status(400).json({
          success: false,
          message: "fromDate cannot be greater than toDate"
        });
      }


      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Invalid date format"
        });
      }

      const generatedAtText = `Report Generated at: ${this.formatDateTime(new Date())}`;

      const match: any = {
        isDelete: 0
      };

      if (fromDate && toDate) {
        match.createdAt = {
          $gte: start,
          $lte: end
        };
      }
      const search = query.search?.trim();

      const pipeline: any[] = [
        {
          $match: match,
        },
        {
          $lookup: {
            from: "member",
            let: { memberId: "$createdBy" },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ["$_id", "$$memberId"] }
                }
              },
              {
                $project: {
                  _id: 1,
                  fullName: 1,
                  chapter: 1
                }
              }
            ],
            as: "invitedBy"
          }
        },
        {
          $unwind: {
            path: "$invitedBy",
            preserveNullAndEmptyArrays: true
          }
        },
        {
          $lookup: {
            from: "chapters",
            localField: "chapterId",
            foreignField: "_id",
            as: "chapter"
          }
        },
        {
          $unwind: {
            path: "$chapter",
            preserveNullAndEmptyArrays: true
          }
        },

        ...(query.chapterId && ObjectId.isValid(query.chapterId)
          ? [{ $match: { "chapter._id": new ObjectId(query.chapterId) } }]
          : []),

        ...(query.zoneId && ObjectId.isValid(query.zoneId)
          ? [{ $match: { "chapter.zoneId": new ObjectId(query.zoneId) } }]
          : []),

        ...(query.edId && ObjectId.isValid(query.edId)
          ? [{ $match: { "chapter.edId": new ObjectId(query.edId) } }]
          : []),

        ...(query.rdId && ObjectId.isValid(query.rdId)
          ? [{ $match: { "chapter.rdId": new ObjectId(query.rdId) } }]
          : []),

        ...(search
          ? [{
            $match: {
              $or: [
                { visitorName: { $regex: search, $options: "i" } },
                { contactNumber: { $regex: search, $options: "i" } },
                { companyName: { $regex: search, $options: "i" } },
                { "invitedBy.fullName": { $regex: search, $options: "i" } },
                { businessCategory: { $regex: search, $options: "i" } }
              ]
            }
          }]
          : []),

        { $sort: { createdAt: -1 } },

        {
          $project: {
            _id: 1,
            date: "$createdAt",
            visitorName: 1,
            contactNumber: 1,
            businessCategory: 1,
            companyName: 1,
            sourceOfEvent: "$status",
            invitedBy: "$invitedBy.fullName",
            chapterName: "$chapter.name"
          }
        }
      ];

      const visitorRepo = AppDataSource.getMongoRepository(Visitor);
      const cursor = visitorRepo.aggregate(pipeline);

      if (format === "pdf") {
        const doc = new PDFDocument({ size: "A4", margin: 30 });

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          "attachment; filename=visitor_report.pdf"
        );

        doc.pipe(res);

        const logoPath = path.resolve(process.cwd(), "uploads", "logo.png");


        const pageWidth = doc.page.width;
        const pageHeight = doc.page.height;
        const margin = 30;
        const contentWidth = pageWidth - margin * 2;

        const HEADER_Y = 145;
        const TABLE_HEADER_HEIGHT = 38;
        const FOOTER_Y = pageHeight - 85;

        /* ================= HEADER ================= */
        const drawHeader = () => {
          if (fs.existsSync(logoPath)) {
            doc.image(logoPath, margin, 35, { width: 65 });
          }

          doc.font("Helvetica-Bold").fontSize(22).fillColor(this.pdfColors.navyBlue);
          doc.text(this.orgName, margin + 80, 42);

          doc.fontSize(14).fillColor(this.pdfColors.red);
          doc.text("Visitor Report", margin + 80, 66);

          const boxX = pageWidth - margin - 185;
          const boxY = 38;

          doc.roundedRect(boxX, boxY, 185, 58, 6)
            .fillAndStroke(this.pdfColors.navyLight, this.pdfColors.navyBlue);

          doc.fontSize(10).fillColor(this.pdfColors.navyBlue);
          doc.text("Report Period", boxX + 12, boxY + 10);

          doc.fontSize(9).fillColor(this.pdfColors.text);
          doc.text(`From:  ${this.formatDateOnly(fromDate)}`, boxX + 12, boxY + 26);
          doc.text(`To : ${this.formatDateOnly(toDate)}`, boxX + 12, boxY + 38);

          doc.font("Helvetica")
            .fontSize(7)
            .fillColor(this.pdfColors.textLight)
            .text(generatedAtText, margin, 110);

          doc.strokeColor(this.pdfColors.navyBlue).lineWidth(2.5)
            .moveTo(margin, 125)
            .lineTo(pageWidth - margin, 125)
            .stroke();

          doc.strokeColor(this.pdfColors.red).lineWidth(1)
            .moveTo(margin, 128)
            .lineTo(pageWidth - margin, 128)
            .stroke();
        };

        const drawTableHeader = (y: number) => {
          doc.rect(margin, y, contentWidth, 30).fill(this.pdfColors.navyBlue);
          doc.rect(margin, y, contentWidth, 3).fill(this.pdfColors.red);

          const columns = [
            { text: "S.No", x: margin + 10, width: 30 },
            { text: "Date", x: margin + 45, width: 80 },
            { text: "Visitors Name", x: margin + 130, width: 100 },
            { text: "Phone Number", x: margin + 230, width: 100 },
            { text: "Business Name", x: margin + 320, width: 90 },
            { text: "Invited By", x: margin + 405, width: 90 }
          ];

          doc.font("Helvetica-Bold").fontSize(9).fillColor(this.pdfColors.white);
          columns.forEach(col =>
            doc.text(col.text, col.x, y + 10, { width: col.width, align: "left" })
          );
        };

        const drawRow = (y: number, index: number, row: any, alt: boolean, rowHeight: number) => {
          if (alt) {
            doc.rect(margin, y - 3, contentWidth, rowHeight).fill(this.pdfColors.rowAlt);
          }

          const getCenteredY = (text: string, width: number) => {
            const h = doc.heightOfString(text || "-", { width });
            return y + (rowHeight - h) / 2 - 2;
          };

          doc.font("Helvetica").fontSize(9).fillColor(this.pdfColors.text);
          doc.text(String(index), margin + 10, getCenteredY(String(index), 30), { width: 30, align: "left" });

          doc.font("Helvetica").fontSize(9).fillColor(this.pdfColors.text);

          const visitorDate = this.formatDate(row.date);
          doc.text(visitorDate, margin + 45, getCenteredY(visitorDate, 80), { width: 80, lineBreak: true, align: "left" });

          doc.text(row.visitorName || "-", margin + 130, getCenteredY(row.visitorName, 100), {
            width: 100,
            lineBreak: true, align: "left"
          });

          doc.text(row.contactNumber || "-", margin + 230, getCenteredY(row.contactNumber, 100), {
            width: 100,
            lineBreak: true, align: "left"
          });

          doc.text(row.companyName || "-", margin + 320, getCenteredY(row.companyName, 90), {
            width: 90,
            lineBreak: true, align: "left"
          });

          doc.text(row.invitedBy || "-", margin + 405, getCenteredY(row.invitedBy, 90), {
            width: 90,
            lineBreak: true, align: "left"
          });
        };

        const drawFooter = (pageNum: number, total: number) => {
          doc.strokeColor(this.pdfColors.navyBlue).lineWidth(1)
            .moveTo(margin, FOOTER_Y)
            .lineTo(pageWidth - margin, FOOTER_Y)
            .stroke();

          doc.fontSize(8).fillColor(this.pdfColors.textLight)
            .text(`Page ${pageNum} of ${total}`, margin, FOOTER_Y + 8, {
              align: "center"
            });

          doc.font("Helvetica").fontSize(7).fillColor(this.pdfColors.navyBlue);
          const footerText = "Powered by: Ocean Softwares";
          const textWidth = doc.widthOfString(footerText);
          const startX = pageWidth - margin - textWidth - 5;
          doc.text("Powered by: ", startX, FOOTER_Y + 8, { continued: true, lineBreak: false, width: pageWidth - startX - margin })
            .text("Ocean Softwares", { link: "https://www.oceansoftwares.com/", underline: true, lineBreak: false });
        };

        const rows: any[] = [];
        for await (const r of cursor) rows.push(r);

        doc.font("Helvetica").fontSize(9);

        const rowHeights = rows.map(row => {
          const h1 = doc.heightOfString(row.visitorName || "-", { width: 100 });
          const h2 = doc.heightOfString(row.companyName || "-", { width: 90 });
          const h3 = doc.heightOfString(row.invitedBy || "-", { width: 90 });
          return Math.max(h1, h2, h3, 16) + 10;
        });

        let totalPages = 1;
        let tempY = HEADER_Y + TABLE_HEADER_HEIGHT;
        for (let i = 0; i < rows.length; i++) {
          if (tempY + rowHeights[i] > FOOTER_Y - 10) {
            totalPages++;
            tempY = HEADER_Y + TABLE_HEADER_HEIGHT;
          }
          tempY += rowHeights[i];
        }

        let pageNum = 1;
        let index = 1;
        let alt = false;
        let y = HEADER_Y;

        drawHeader();
        drawTableHeader(y);
        y += TABLE_HEADER_HEIGHT;

        for (let i = 0; i < rows.length; i++) {
          const rowHeight = rowHeights[i];

          if (y + rowHeight > FOOTER_Y - 10) {
            drawFooter(pageNum, totalPages);
            doc.addPage();
            pageNum++;

            drawHeader();
            y = HEADER_Y;
            drawTableHeader(y);
            y += TABLE_HEADER_HEIGHT;
            alt = false;
          }

          drawRow(y, index++, rows[i], alt, rowHeight);
          alt = !alt;
          y += rowHeight;
        }

        drawFooter(pageNum, totalPages);
        doc.end();
        return res;
      }

      if (format === "csv") {
        const rows: any[] = [];
        let index = 1;



        for await (const item of cursor) {
          rows.push({
            "S.No": index++,
            "Date": this.formatDate(item.date),
            "Visitors Name": item.visitorName || "-",
            "Phone Number": item.contactNumber || "-",
            "Business Category": item.businessCategory || "-",
            "Business Name": item.companyName || "-",
            "Source of event": item.sourceOfEvent || "-",
            "Invited By": item.invitedBy || "-"
          });
        }

        if (rows.length === 0) {
          return res.status(404).json({
            success: false,
            message: "No data found"
          });
        }

        const parser = new Parser();
        const dataCsv = parser.parse(rows);

        const reportLine = `"${generatedAtText}"\n\n`;
        const csv = reportLine + dataCsv;

        res.setHeader("Content-Type", "text/csv");
        res.setHeader(
          "Content-Disposition",
          "attachment; filename=visitor_report.csv"
        );

        res.send(csv);
        return res;
      }

      if (format === "excel") {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet("Visitor Report");

        sheet.addRow([generatedAtText]);
        sheet.mergeCells("A1:H1");
        sheet.getRow(1).font = { italic: true };
        sheet.addRow([]);

        sheet.columns = [
          { header: "S.No", key: "sno", width: 8 },
          { header: "Date", key: "date", width: 15 },
          { header: "Visitors Name", key: "visitorName", width: 25 },
          { header: "Phone Number", key: "phone", width: 18 },
          { header: "Business Category", key: "category", width: 25 },
          { header: "Business Name", key: "company", width: 30 },
          { header: "Source of event", key: "source", width: 18 },
          { header: "Invited By", key: "invitedBy", width: 25 }
        ];

        let index = 1;

        for await (const item of cursor) {
          sheet.addRow({
            sno: index++,
            date: this.formatDate(item.date),
            visitorName: item.visitorName || "-",
            phone: item.contactNumber || "-",
            category: item.businessCategory || "-",
            company: item.companyName || "-",
            source: item.sourceOfEvent || "-",
            invitedBy: item.invitedBy || "-"
          });
        }

        res.setHeader(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        res.setHeader(
          "Content-Disposition",
          "attachment; filename=visitor_report.xlsx"
        );

        await workbook.xlsx.write(res);
        res.end();
        return res;
      }

      return res.status(400).json({
        success: false,
        message: "Invalid format. Use csv | excel | pdf"
      });

    } catch (error) {
      console.error(error);
      if (!res.headersSent) {
        return res.status(500).json({
          success: false,
          message: "Failed to export visitor report"
        });
      }
    }
  }


  @Get("/chief-guests-report")
  async chiefGuestReport(
    @QueryParams() query: any,
    @Res() res: Response
  ) {
    try {

      const page = Math.max(Number(query.page) || 0, 0);
      const limit = Math.max(Number(query.limit) || 10, 1);
      const search = query.search?.toString();
      const chapterId = query.chapterId;
      const zoneId = query.zoneId;
      const edId = query.edId;
      const rdId = query.rdId;

      const match: any = {
        isDelete: 0,
      };

      const pipeline: any[] = [

        { $match: match },

        {
          $lookup: {
            from: "member",
            localField: "createdBy",
            foreignField: "_id",
            as: "invitedBy"
          }
        },
        { $unwind: "$invitedBy" },

        {
          $lookup: {
            from: "chapters",
            localField: "invitedBy.chapter",
            foreignField: "_id",
            as: "chapter"
          }
        },
        { $unwind: "$chapter" },

        ...(chapterId
          ? [{
            $match: {
              "chapter._id": new ObjectId(chapterId)
            }
          }]
          : []),

        ...(zoneId
          ? [{
            $match: {
              "chapter.zoneId": new ObjectId(zoneId)
            }
          }]
          : []),

        ...(edId
          ? [{
            $match: {
              "chapter.edId": new ObjectId(edId)
            }
          }]
          : []),

        ...(rdId
          ? [{
            $match: {
              "chapter.rdId": new ObjectId(rdId)
            }
          }]
          : []),

        {
          $project: {
            _id: 1,
            date: "$createdAt",
            chiefGuestName: 1,
            contactNumber: 1,
            businessCategory: 1,
            businessName: 1,
            sourceType: 1,
            invitedBy: "$invitedBy.fullName",
            chapter: "$chapter.chapterName"
          }
        },
        ...(search ? [{
          $match: {
            $or: [
              { chiefGuestName: { $regex: search, $options: "i" } },
              { contactNumber: { $regex: search, $options: "i" } },
              { businessCategory: { $regex: search, $options: "i" } },
              { businessName: { $regex: search, $options: "i" } },
              { sourceType: { $regex: search, $options: "i" } },
              { invitedBy: { $regex: search, $options: "i" } },
              { chapter: { $regex: search, $options: "i" } }
            ]
          }
        }] : []),


        {
          $facet: {
            data: [
              { $sort: { createdAt: -1 } },
              { $skip: page * limit },
              { $limit: limit }
            ],
            meta: [
              { $count: "total" }
            ]
          }
        }
      ];

      const result =
        await this.chiefGuestRepo.aggregate(pipeline).toArray();

      const data = result[0]?.data || [];
      const total = result[0]?.meta[0]?.total || 0;

      return pagination(total, data, limit, page, res);

    } catch (error) {
      console.error(error);
      return response(res, 500, "Failed to fetch chief guest report");
    }
  }
  @Get("/chief-guests-report/export")
  async exportchiefGuest(
    @QueryParams() query: any,
    @Res() res: Response
  ): Promise<Response | void> {
    try {
      const { fromDate, toDate, format = "csv" } = query;

      if (!fromDate || !toDate) {
        return res.status(400).json({
          success: false,
          message: "fromDate and toDate are required"
        });
      }

      const start = new Date(`${fromDate}T00:00:00+05:30`);
      const end = new Date(`${toDate}T23:59:59.999+05:30`);
      if (start > end) {
        return res.status(400).json({
          success: false,
          message: "fromDate cannot be greater than toDate"
        });
      }


      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Invalid date format"
        });
      }

      const generatedAtText = `Report Generated at: ${this.formatDateTime(new Date())}`;

      const search = query.search?.toString();
      const chapterId = query.chapterId;
      const zoneId = query.zoneId;
      const edId = query.edId;
      const rdId = query.rdId;

      const match: any = {
        isDelete: 0,
        createdAt: {
          $gte: start,
          $lte: end
        }
      };

      const pipeline: any[] = [

        { $match: match },

        {
          $lookup: {
            from: "member",
            localField: "createdBy",
            foreignField: "_id",
            as: "invitedBy"
          }
        },
        { $unwind: "$invitedBy" },

        {
          $lookup: {
            from: "chapters",
            localField: "invitedBy.chapter",
            foreignField: "_id",
            as: "chapter"
          }
        },
        { $unwind: { path: "$chapter", preserveNullAndEmptyArrays: true } },

        ...(chapterId
          ? [{
            $match: {
              "chapter._id": new ObjectId(chapterId)
            }
          }]
          : []),

        ...(zoneId
          ? [{
            $match: {
              "chapter.zoneId": new ObjectId(zoneId)
            }
          }]
          : []),

        ...(edId
          ? [{
            $match: {
              "chapter.edId": new ObjectId(edId)
            }
          }]
          : []),

        ...(rdId
          ? [{
            $match: {
              "chapter.rdId": new ObjectId(rdId)
            }
          }]
          : []),

        {
          $project: {
            _id: 1,
            date: "$createdAt",
            chiefGuestName: 1,
            contactNumber: 1,
            businessCategory: 1,
            businessName: 1,
            sourceOfEvent: "$sourceType",
            invitedBy: "$invitedBy.fullName",
            chapter: "$chapter.chapterName"
          }
        },
        ...(search ? [{
          $match: {
            $or: [
              { chiefGuestName: { $regex: search, $options: "i" } },
              { contactNumber: { $regex: search, $options: "i" } },
              { businessCategory: { $regex: search, $options: "i" } },
              { businessName: { $regex: search, $options: "i" } },
              { sourceType: { $regex: search, $options: "i" } },
              { invitedBy: { $regex: search, $options: "i" } },
              { chapter: { $regex: search, $options: "i" } }
            ]
          }
        }] : []),

      ];

      const cursor = this.chiefGuestRepo.aggregate(pipeline);

      if (format === "pdf") {
        const doc = new PDFDocument({ size: "A4", margin: 30 });

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          "attachment; filename=chief_guest_report.pdf"
        );

        doc.pipe(res);

        const logoPath = path.resolve(process.cwd(), "uploads", "logo.png");


        const pageWidth = doc.page.width;
        const pageHeight = doc.page.height;
        const margin = 30;
        const contentWidth = pageWidth - margin * 2;

        const HEADER_Y = 145;
        const TABLE_HEADER_HEIGHT = 38;
        const FOOTER_Y = pageHeight - 85;

        const drawHeader = () => {
          if (fs.existsSync(logoPath)) {
            doc.image(logoPath, margin, 35, { width: 65 });
          }

          doc.font("Helvetica-Bold").fontSize(22).fillColor(this.pdfColors.navyBlue);
          doc.text(this.orgName, margin + 80, 42);

          doc.fontSize(14).fillColor(this.pdfColors.red);
          doc.text("Chief Guest Report", margin + 80, 66);

          const boxX = pageWidth - margin - 185;
          const boxY = 38;

          doc.roundedRect(boxX, boxY, 185, 58, 6)
            .fillAndStroke(this.pdfColors.navyLight, this.pdfColors.navyBlue);

          doc.fontSize(10).fillColor(this.pdfColors.navyBlue);
          doc.text("Report Period", boxX + 12, boxY + 10);

          doc.fontSize(9).fillColor(this.pdfColors.text);
          doc.text(`From:  ${this.formatDateOnly(fromDate)}`, boxX + 12, boxY + 26);
          doc.text(`To : ${this.formatDateOnly(toDate)}`, boxX + 12, boxY + 38);

          doc.font("Helvetica")
            .fontSize(7)
            .fillColor(this.pdfColors.textLight)
            .text(generatedAtText, margin, 110);

          doc.strokeColor(this.pdfColors.navyBlue).lineWidth(2.5)
            .moveTo(margin, 125)
            .lineTo(pageWidth - margin, 125)
            .stroke();

          doc.strokeColor(this.pdfColors.red).lineWidth(1)
            .moveTo(margin, 128)
            .lineTo(pageWidth - margin, 128)
            .stroke();
        };

        const drawTableHeader = (y: number) => {
          doc.rect(margin, y, contentWidth, 30).fill(this.pdfColors.navyBlue);
          doc.rect(margin, y, contentWidth, 3).fill(this.pdfColors.red);

          const columns = [
            { text: "S.No", x: margin + 10, width: 30 },
            { text: "Date", x: margin + 45, width: 80 },
            { text: "Chief Guest Name", x: margin + 130, width: 100 },
            { text: "Phone Number", x: margin + 230, width: 100 },
            { text: "Business Category", x: margin + 320, width: 90 },
            { text: "Invited By", x: margin + 405, width: 90 }
          ];

          doc.font("Helvetica-Bold").fontSize(9).fillColor(this.pdfColors.white);
          columns.forEach(col =>
            doc.text(col.text, col.x, y + 10, { width: col.width, align: "left" })
          );
        };
        const drawRow = (y: number, index: number, row: any, alt: boolean, rowHeight: number) => {
          if (alt) {
            doc.rect(margin, y - 3, contentWidth, rowHeight).fill(this.pdfColors.rowAlt);
          }

          const getCenteredY = (text: string, width: number) => {
            const h = doc.heightOfString(text || "-", { width });
            return y + (rowHeight - h) / 2 - 2;
          };

          doc.font("Helvetica").fontSize(9).fillColor(this.pdfColors.text);
          doc.text(String(index), margin + 10, getCenteredY(String(index), 30), { width: 30, align: "left" });

          const guestDate = this.formatDate(row.date);
          doc.text(guestDate, margin + 45, getCenteredY(guestDate, 80), { width: 80, lineBreak: true, align: "left" });

          doc.text(row.chiefGuestName || "-", margin + 130, getCenteredY(row.chiefGuestName, 100), {
            width: 100,
            lineBreak: true, align: "left"
          });

          doc.text(row.contactNumber || "-", margin + 230, getCenteredY(row.contactNumber, 100), {
            width: 100,
            lineBreak: true, align: "left"
          });

          doc.text(row.businessCategory || "-", margin + 320, getCenteredY(row.businessCategory, 90), {
            width: 90,
            lineBreak: true, align: "left"
          });

          doc.text(row.invitedBy || "-", margin + 405, getCenteredY(row.invitedBy, 90), {
            width: 90,
            lineBreak: true, align: "left"
          });
        };

        const drawFooter = (pageNum: number, total: number) => {
          doc.strokeColor(this.pdfColors.navyBlue).lineWidth(1)
            .moveTo(margin, FOOTER_Y)
            .lineTo(pageWidth - margin, FOOTER_Y)
            .stroke();

          doc.fontSize(8).fillColor(this.pdfColors.textLight)
            .text(`Page ${pageNum} of ${total}`, margin, FOOTER_Y + 8, {
              align: "center"
            });

          doc.font("Helvetica").fontSize(7).fillColor(this.pdfColors.navyBlue);
          const footerText = "Powered by: Ocean Softwares";
          const textWidth = doc.widthOfString(footerText);
          const startX = pageWidth - margin - textWidth - 5;
          doc.text("Powered by: ", startX, FOOTER_Y + 8, { continued: true, lineBreak: false, width: pageWidth - startX - margin })
            .text("Ocean Softwares", { link: "https://www.oceansoftwares.com/", underline: true, lineBreak: false });
        };

        const rows: any[] = [];
        for await (const r of cursor) rows.push(r);

        doc.font("Helvetica").fontSize(9);

        const rowHeights = rows.map(row => {
          const h1 = doc.heightOfString(row.chiefGuestName || "-", { width: 100 });
          const h2 = doc.heightOfString(row.businessCategory || "-", { width: 90 });
          const h3 = doc.heightOfString(row.invitedBy || "-", { width: 90 });
          return Math.max(h1, h2, h3, 16) + 10;
        });

        let totalPages = 1;
        let tempY = HEADER_Y + TABLE_HEADER_HEIGHT;
        for (let i = 0; i < rows.length; i++) {
          if (tempY + rowHeights[i] > FOOTER_Y - 10) {
            totalPages++;
            tempY = HEADER_Y + TABLE_HEADER_HEIGHT;
          }
          tempY += rowHeights[i];
        }

        let pageNum = 1;
        let index = 1;
        let alt = false;
        let y = HEADER_Y;

        drawHeader();
        drawTableHeader(y);
        y += TABLE_HEADER_HEIGHT;

        for (let i = 0; i < rows.length; i++) {
          const rowHeight = rowHeights[i];

          if (y + rowHeight > FOOTER_Y - 10) {
            drawFooter(pageNum, totalPages);
            doc.addPage();
            pageNum++;

            drawHeader();
            y = HEADER_Y;
            drawTableHeader(y);
            y += TABLE_HEADER_HEIGHT;
            alt = false;
          }

          drawRow(y, index++, rows[i], alt, rowHeight);
          alt = !alt;
          y += rowHeight;
        }

        drawFooter(pageNum, totalPages);
        doc.end();
        return res;
      }

      if (format === "csv") {
        const rows: any[] = [];
        let index = 1;



        for await (const item of cursor) {
          rows.push({
            "S.No": index++,
            "Date": this.formatDate(item.date),
            "Chief Guest Name": item.chiefGuestName || "-",
            "Phone Number": item.contactNumber || "-",
            "Business Category": item.businessCategory || "-",
            "Business Name": item.businessName || "-",
            "Source of event": item.sourceOfEvent || "-",
            "Invited By": item.invitedBy || "-"
          });
        }

        const parser = new Parser();
        const dataCsv = parser.parse(rows);

        const reportLine = `"${generatedAtText}"\n\n`;
        const csv = reportLine + dataCsv;

        res.setHeader("Content-Type", "text/csv");
        res.setHeader(
          "Content-Disposition",
          "attachment; filename=visitor_report.csv"
        );

        res.send(csv);
        return res;
      }

      if (format === "excel") {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet("Visitor Report");

        sheet.addRow([generatedAtText]);
        sheet.mergeCells("A1:H1");
        sheet.getRow(1).font = { italic: true };
        sheet.addRow([]);

        sheet.columns = [
          { header: "S.No", key: "sno", width: 8 },
          { header: "Date", key: "date", width: 15 },
          { header: "Chief Guest Name", key: "visitorName", width: 25 },
          { header: "Phone Number", key: "phone", width: 18 },
          { header: "Business Category", key: "category", width: 25 },
          { header: "Business Name", key: "company", width: 30 },
          { header: "Source of event", key: "source", width: 18 },
          { header: "Invited By", key: "invitedBy", width: 25 }
        ];

        let index = 1;

        for await (const item of cursor) {
          sheet.addRow({
            sno: index++,
            date: this.formatDate(item.date),
            visitorName: item.chiefGuestName || "-",
            phone: item.contactNumber || "-",
            category: item.businessCategory || "-",
            company: item.businessName || "-",
            source: item.sourceOfEvent || "-",
            invitedBy: item.invitedBy || "-"
          });
        }

        res.setHeader(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        res.setHeader(
          "Content-Disposition",
          "attachment; filename=visitor_report.xlsx"
        );

        await workbook.xlsx.write(res);
        res.end();
        return res;
      }

      return res.status(400).json({
        success: false,
        message: "Invalid format. Use csv | excel | pdf"
      });

    } catch (error) {
      console.error(error);
      if (!res.headersSent) {
        return res.status(500).json({
          success: false,
          message: "Failed to export visitor report"
        });
      }
    }
  }

  @Get("/power-dates-report")
  async powerDateReport(
    @QueryParams() query: any,
    @Res() res: Response
  ) {
    try {

      const page = Math.max(Number(query.page) || 0, 0);
      const limit = Math.max(Number(query.limit) || 10, 1);
      const search = query.search?.toString();

      const chapterId = query.chapterId;
      const zoneId = query.zoneId;
      const regionId = query.regionId;
      const edId = query.edId;
      const rdId = query.rdId;

      const pipeline: any[] = [

        {
          $match: {
            isDelete: 0,
          }
        },

        {
          $lookup: {
            from: "member",
            localField: "createdBy",
            foreignField: "_id",
            as: "creator"
          }
        },
        { $unwind: "$creator" },

        {
          $lookup: {
            from: "chapters",
            localField: "creator.chapter",
            foreignField: "_id",
            as: "chapter"
          }
        },
        { $unwind: "$chapter" },

        {
          $lookup: {
            from: "member",
            localField: "members",
            foreignField: "_id",
            as: "invitedMembers"
          }
        },

        ...(chapterId ? [{
          $match: { "chapter._id": new ObjectId(chapterId) }
        }] : []),

        ...(zoneId ? [{
          $match: { "chapter.zoneId": new ObjectId(zoneId) }
        }] : []),

        ...(regionId ? [{
          $match: { "chapter.regionId": new ObjectId(regionId) }
        }] : []),

        ...(edId ? [{
          $match: { "chapter.edId": new ObjectId(edId) }
        }] : []),

        ...(rdId ? [{
          $match: { "chapter.rdId": new ObjectId(rdId) }
        }] : []),

        {
          $addFields: {

            invitedTo: {
              $map: {
                input: "$invitedMembers",
                as: "m",
                in: "$$m.fullName"
              }
            },

            referralTemp: {
              $switch: {
                branches: [
                  { case: { $gte: ["$rating", 5] }, then: "Hot" },
                  { case: { $gte: ["$rating", 3] }, then: "Warm" }
                ],
                default: "Cold"
              }
            }
          }
        },
        ...(search
          ? [{
            $match: {
              $or: [
                { "creator.fullName": { $regex: search, $options: "i" } },

                { invitedTo: { $elemMatch: { $regex: search, $options: "i" } } },

                { meetingStatus: { $regex: search, $options: "i" } },

                { name: { $regex: search, $options: "i" } },

                { comments: { $regex: search, $options: "i" } },

                { referralTemp: { $regex: search, $options: "i" } }
              ]
            }
          }]
          : []),

        {
          $project: {
            _id: 1,
            date: "$createdAt",
            memberName: "$creator.fullName",
            invitedTo: 1,
            meetingStatus: 1,
            name: "$name",
            comments: 1,
            referralTemp: 1,
            phoneNumber: 1,
            email: 1,
            address: 1

          }
        },

        // Pagination
        {
          $facet: {
            data: [
              { $sort: { createdAt: -1 } },
              { $skip: page * limit },
              { $limit: limit }
            ],
            meta: [{ $count: "total" }]
          }
        }
      ];

      const result =
        await this.powerDateRepo.aggregate(pipeline).toArray();

      const data = result[0]?.data || [];
      const total = result[0]?.meta[0]?.total || 0;

      return pagination(total, data, limit, page, res);

    } catch (error) {
      console.error(error);
      return response(res, 500, "Failed to fetch power date report");
    }
  }

  @Get("/power-dates-report/export")
  async exportPowerDateReport(
    @QueryParams() query: any,
    @Res() res: Response
  ): Promise<Response | void> {
    try {
      const { fromDate, toDate, format = "csv" } = query;

      if (!fromDate || !toDate) {
        return res.status(400).json({
          success: false,
          message: "fromDate and toDate are required"
        });
      }

      const start = new Date(`${fromDate}T00:00:00+05:30`);
      const end = new Date(`${toDate}T23:59:59.999+05:30`);
      if (start > end) {
        return res.status(400).json({
          success: false,
          message: "fromDate cannot be greater than toDate"
        });
      }


      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Invalid date format"
        });
      }

      const generatedAtText = `Report Generated at: ${this.formatDateTime(new Date())}`;

      const search = query.search?.toString();

      const chapterId = query.chapterId;
      const zoneId = query.zoneId;
      const regionId = query.regionId;
      const edId = query.edId;
      const rdId = query.rdId;

      const pipeline: any[] = [

        {
          $match: {
            isDelete: 0,
            createdAt: {
              $gte: start,
              $lte: end
            }
          }
        },

        {
          $lookup: {
            from: "member",
            localField: "createdBy",
            foreignField: "_id",
            as: "creator"
          }
        },
        { $unwind: "$creator" },

        {
          $lookup: {
            from: "chapters",
            localField: "creator.chapter",
            foreignField: "_id",
            as: "chapter"
          }
        },
        { $unwind: "$chapter" },

        {
          $lookup: {
            from: "member",
            localField: "members",
            foreignField: "_id",
            as: "invitedMembers"
          }
        },

        ...(chapterId ? [{
          $match: { "chapter._id": new ObjectId(chapterId) }
        }] : []),

        ...(zoneId ? [{
          $match: { "chapter.zoneId": new ObjectId(zoneId) }
        }] : []),

        ...(regionId ? [{
          $match: { "chapter.regionId": new ObjectId(regionId) }
        }] : []),

        ...(edId ? [{
          $match: { "chapter.edId": new ObjectId(edId) }
        }] : []),

        ...(rdId ? [{
          $match: { "chapter.rdId": new ObjectId(rdId) }
        }] : []),

        {
          $addFields: {

            invitedTo: {
              $map: {
                input: "$invitedMembers",
                as: "m",
                in: "$$m.fullName"
              }
            },

            referralTemp: {
              $switch: {
                branches: [
                  { case: { $gte: ["$rating", 5] }, then: "Hot" },
                  { case: { $gte: ["$rating", 3] }, then: "Warm" }
                ],
                default: "Cold"
              }
            }
          }
        },
        ...(search
          ? [{
            $match: {
              $or: [
                { "creator.fullName": { $regex: search, $options: "i" } },

                { invitedTo: { $elemMatch: { $regex: search, $options: "i" } } },

                { meetingStatus: { $regex: search, $options: "i" } },

                { name: { $regex: search, $options: "i" } },

                { comments: { $regex: search, $options: "i" } },

                { referralTemp: { $regex: search, $options: "i" } }
              ]
            }
          }]
          : []),

        {
          $project: {
            _id: 1,
            date: "$createdAt",
            memberName: "$creator.fullName",
            invitedTo: 1,
            meetingStatus: 1,
            name: "$name",
            comments: 1,
            referralTemp: 1,
            phoneNumber: 1,
            email: 1,
            address: 1

          }
        },
      ];

      const cursor = this.powerDateRepo.aggregate(pipeline)

      if (format === "pdf") {
        const doc = new PDFDocument({ size: "A4", margin: 30 });

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          "attachment; filename=power_date_report.pdf"
        );

        doc.pipe(res);

        const logoPath = path.resolve(process.cwd(), "uploads", "logo.png");


        const pageWidth = doc.page.width;
        const pageHeight = doc.page.height;
        const margin = 30;
        const contentWidth = pageWidth - margin * 2;

        const HEADER_Y = 120;
        const TABLE_HEADER_HEIGHT = 28;
        const FOOTER_Y = pageHeight - 85;

        const formatLabel = (value?: string) => {
          if (!value) return "-";
          return value
            .toLowerCase()
            .split("_")
            .map(v => v.charAt(0).toUpperCase() + v.slice(1))
            .join(" ");
        };


        const drawHeader = () => {
          if (fs.existsSync(logoPath)) {
            doc.image(logoPath, margin, 35, { width: 65 });
          }

          doc.font("Helvetica-Bold").fontSize(22).fillColor(this.pdfColors.navyBlue);
          doc.text(this.orgName, margin + 80, 42);

          doc.fontSize(14).fillColor(this.pdfColors.red);
          doc.text("Power Meet Report", margin + 80, 66);

          const boxX = pageWidth - margin - 185;
          const boxY = 38;

          doc
            .roundedRect(boxX, boxY, 185, 58, 6)
            .fillAndStroke(this.pdfColors.navyLight, this.pdfColors.navyBlue);

          doc.fontSize(10).fillColor(this.pdfColors.navyBlue);
          doc.text("Report Period", boxX + 12, boxY + 10);

          doc.fontSize(9).fillColor(this.pdfColors.text);
          doc.text(`From:  ${this.formatDateOnly(fromDate)}`, boxX + 12, boxY + 26);
          doc.text(`To : ${this.formatDateOnly(toDate)}`, boxX + 12, boxY + 38);

          doc
            .font("Helvetica")
            .fontSize(7)
            .fillColor(this.pdfColors.textLight)
            .text(generatedAtText, margin, 110);

          doc.strokeColor(this.pdfColors.navyBlue).lineWidth(2.5)
            .moveTo(margin, 125)
            .lineTo(pageWidth - margin, 125)
            .stroke();

          doc.strokeColor(this.pdfColors.red).lineWidth(1)
            .moveTo(margin, 128)
            .lineTo(pageWidth - margin, 128)
            .stroke();
        };

        const drawTableHeader = (y: number) => {
          doc.rect(margin, y, contentWidth, TABLE_HEADER_HEIGHT).fill(this.pdfColors.navyBlue);
          doc.rect(margin, y, contentWidth, 2).fill(this.pdfColors.red);

          const columns = [
            { text: "S.No", x: margin + 5, width: 35 },
            { text: "Date", x: margin + 40, width: 65 },
            { text: "Member Name", x: margin + 105, width: 85 },
            { text: "Invited To", x: margin + 190, width: 130 },
            { text: "Meeting Status", x: margin + 320, width: 70 },
            { text: "Name", x: margin + 390, width: 65 },
            { text: "Referral Temp", x: margin + 455, width: 90 }
          ];

          doc.font("Helvetica-Bold")
            .fontSize(9)
            .fillColor(this.pdfColors.white);

          columns.forEach(col =>
            doc.text(col.text, col.x, y + 7, { width: col.width, align: "left" })
          );
        };

        /* ---------------- ROW ---------------- */
        const drawRow = (y: number, index: number, row: any, alt: boolean, rowHeight: number) => {
          if (alt) {
            doc.rect(margin, y - 2, contentWidth, rowHeight).fill(this.pdfColors.rowAlt);
          }

          const getCenteredY = (text: string, width: number) => {
            const h = doc.heightOfString(text || "-", { width });
            return y + (rowHeight - h) / 2 - 2;
          };

          doc.font("Helvetica").fontSize(8).fillColor(this.pdfColors.text);
          doc.text(String(index), margin + 10, getCenteredY(String(index), 30), { width: 30, align: "left" });

          doc.font("Helvetica").fontSize(9).fillColor(this.pdfColors.text);

          const powerDate = this.formatDate(row.date);
          doc.text(powerDate, margin + 40, getCenteredY(powerDate, 65), {
            width: 65,
            align: "left",
            lineBreak: true
          });

          doc.text(row.memberName || "-", margin + 105, getCenteredY(row.memberName, 85), {
            width: 85,
            lineBreak: true,
            align: "left"
          });

          const invitedTo = Array.isArray(row.invitedTo) ? row.invitedTo.join(", ") : (row.invitedTo || "-");
          doc.text(invitedTo, margin + 190, getCenteredY(invitedTo, 130), {
            width: 130,
            lineBreak: true,
            align: "left"
          });

          doc.text(row.meetingStatus || "-", margin + 320, getCenteredY(row.meetingStatus, 70), {
            width: 70,
            lineBreak: true,
            align: "left"
          });

          const guestName = formatLabel(row.name);
          doc.text(guestName, margin + 390, getCenteredY(guestName, 65), {
            width: 65,
            align: "left",
            lineBreak: true
          });

          const temp = formatLabel(row.referralTemp);
          doc.text(temp, margin + 455, getCenteredY(temp, 90), {
            width: 90,
            align: "left",
            lineBreak: true
          });
        };
        const drawFooter = (pageNum: number, total: number) => {
          doc.strokeColor(this.pdfColors.navyBlue).lineWidth(1)
            .moveTo(margin, FOOTER_Y)
            .lineTo(pageWidth - margin, FOOTER_Y)
            .stroke();

          doc.strokeColor(this.pdfColors.red).lineWidth(0.5)
            .moveTo(margin, FOOTER_Y + 2)
            .lineTo(pageWidth - margin, FOOTER_Y + 2)
            .stroke();

          doc.fontSize(8)
            .fillColor(this.pdfColors.textLight)
            .text(`Page ${pageNum} of ${total}`, margin, FOOTER_Y + 8, {
              align: "center"
            });

          doc.font("Helvetica").fontSize(7).fillColor(this.pdfColors.navyBlue);
          const footerText = "Powered by: Ocean Softwares";
          const textWidth = doc.widthOfString(footerText);
          const startX = pageWidth - margin - textWidth - 5;
          doc.text("Powered by: ", startX, FOOTER_Y + 8, { continued: true, lineBreak: false, width: pageWidth - startX - margin })
            .text("Ocean Softwares", { link: "https://www.oceansoftwares.com/", underline: true, lineBreak: false });
        };

        const rows: any[] = [];
        for await (const r of cursor) rows.push(r);

        doc.font("Helvetica").fontSize(9);

        const rowHeights = rows.map(row => {
          const h1 = doc.heightOfString(row.memberName || "-", { width: 85 });
          const text = Array.isArray(row.invitedTo) ? row.invitedTo.join(", ") : (row.invitedTo || "-");
          const h2 = doc.heightOfString(text, { width: 130 });
          const h3 = doc.heightOfString(row.meetingStatus || "-", { width: 70 });
          const h4 = doc.heightOfString(formatLabel(row.name), { width: 65 });
          const h5 = doc.heightOfString(formatLabel(row.referralTemp), { width: 90 });
          return Math.max(h1, h2, h3, h4, h5, 16) + 12;
        });

        let totalPages = 1;
        let tempY = HEADER_Y + TABLE_HEADER_HEIGHT;
        for (let i = 0; i < rows.length; i++) {
          if (tempY + rowHeights[i] > FOOTER_Y - 10) {
            totalPages++;
            tempY = HEADER_Y + TABLE_HEADER_HEIGHT;
          }
          tempY += rowHeights[i];
        }

        let pageNum = 1;
        let index = 1;
        let alt = false;
        let y = HEADER_Y;

        drawHeader();
        drawTableHeader(y);
        y += TABLE_HEADER_HEIGHT;

        for (let i = 0; i < rows.length; i++) {
          const rowHeight = rowHeights[i];

          if (y + rowHeight > FOOTER_Y - 10) {
            drawFooter(pageNum, totalPages);
            doc.addPage();
            pageNum++;

            drawHeader();
            y = HEADER_Y;
            drawTableHeader(y);
            y += TABLE_HEADER_HEIGHT;
            alt = false;
          }

          drawRow(y, index++, rows[i], alt, rowHeight);
          alt = !alt;
          y += rowHeight;
        }

        drawFooter(pageNum, totalPages);
        doc.end();
        return res;
      }


      if (format === "csv") {
        const rows: any[] = [];
        let index = 1;



        for await (const item of cursor) {
          rows.push({
            "S.No": index++,
            "Date": this.formatDate(item.date),
            "Member Name": item.memberName || "-",
            "Invited To": item.invitedTo || "-",
            "Meeting Status": item.meetingStatus || "-",
            "name": item.name || "-",
            "Referral Temp": item.referralTemp || '-'
          });
        }

        if (rows.length === 0) {
          return res.status(404).json({ success: false, message: "No data found" });
        }

        const parser = new Parser();
        const dataCsv = parser.parse(rows);

        const reportLine = `"${generatedAtText}"\n\n`;
        const csv = reportLine + dataCsv;

        res.setHeader("Content-Type", "text/csv");
        res.setHeader(
          "Content-Disposition",
          "attachment; filename=power_date_report.csv"
        );
        res.send(csv);
        return res;
      }

      /* ===================== EXCEL ===================== */
      if (format === "excel") {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet("Power Meet Report");

        sheet.addRow([generatedAtText]);
        sheet.mergeCells("A1:G1");
        sheet.getRow(1).font = { italic: true };
        sheet.addRow([]);

        sheet.columns = [
          { header: "S.No", key: "sno", width: 8 },
          { header: "Date", key: "date", width: 20 },
          { header: "Member Name", key: "memberName", width: 25 },
          { header: "Invited To", key: "invitedTo", width: 40 },
          { header: "Meeting Status", key: "meetingStatus", width: 18 },
          { header: "name", key: "name", width: 12 },
          { header: "Referral Temp", key: "referralTemp", width: 18 }

        ];

        let index = 1;
        for await (const item of cursor) {
          sheet.addRow({
            sno: index++,
            date: this.formatDate(item.date),
            memberName: item.memberName || "-",
            invitedTo: item.invitedTo || "-",
            meetingStatus: item.meetingStatus || "-",
            name: item.name ?? "-",
            referralTemp: item.referralTemp || "-",
          });
        }

        res.setHeader(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        res.setHeader(
          "Content-Disposition",
          "attachment; filename=power_date_report.xlsx"
        );

        await workbook.xlsx.write(res);
        res.end();
        return res;
      }

      return res.status(400).json({
        success: false,
        message: "Invalid format. Use csv | excel | pdf"
      });
    } catch (error) {
      console.error(error);
      if (!res.headersSent) {
        return res.status(500).json({
          success: false,
          message: "Failed to export power date report"
        });
      }
    }
  }


  @Get("/trainings-report")
  async trainingReport(
    @QueryParams() query: any,
    @Res() res: Response
  ) {
    try {

      const page = Math.max(Number(query.page) || 0, 0);
      const limit = Math.max(Number(query.limit) || 10, 1);

      const search = query.search?.toString();

      const pipeline: any[] = [

        // 1️⃣ Base match
        {
          $match: {
            isDelete: 0,
          }
        },

        // 2️⃣ Chapter Lookup (projected)
        {
          $lookup: {
            from: "chapters",
            let: { chapterIds: "$chapterIds" },
            pipeline: [
              {
                $match: {
                  $expr: { $in: ["$_id", "$$chapterIds"] }
                }
              },
              {
                $project: {
                  _id: 1,
                  zoneId: 1,
                  regionId: 1,
                  edId: 1,
                  rdId: 1
                }
              }
            ],
            as: "chapters"
          }
        },

        // 3️⃣ Trainer Lookup (projected)
        {
          $lookup: {
            from: "adminusers",
            let: { trainerIds: "$trainerIds" },
            pipeline: [
              {
                $match: {
                  $expr: { $in: ["$_id", "$$trainerIds"] }
                }
              },
              {
                $project: {
                  _id: 1,
                  fullName: "$name"
                }
              }
            ],
            as: "trainers"
          }
        },

        // 4️⃣ Filters
        ...(query.chapterId && ObjectId.isValid(query.chapterId)
          ? [{ $match: { "chapters._id": new ObjectId(query.chapterId) } }]
          : []),

        ...(query.zoneId && ObjectId.isValid(query.zoneId)
          ? [{ $match: { "chapters.zoneId": new ObjectId(query.zoneId) } }]
          : []),

        ...(query.regionId && ObjectId.isValid(query.regionId)
          ? [{ $match: { "chapters.regionId": new ObjectId(query.regionId) } }]
          : []),

        ...(query.edId && ObjectId.isValid(query.edId)
          ? [{ $match: { "chapters.edId": new ObjectId(query.edId) } }]
          : []),

        ...(query.rdId && ObjectId.isValid(query.rdId)
          ? [{ $match: { "chapters.rdId": new ObjectId(query.rdId) } }]
          : []),

        ...(search
          ? [{
            $match: {
              $or: [
                { title: { $regex: search, $options: "i" } },
                { "trainers.fullName": { $regex: search, $options: "i" } }
              ]
            }
          }]
          : []),

        // 5️⃣ Final projection
        {
          $project: {
            _id: 1,
            date: "$trainingDateTime",
            title: 1,
            trainerNames: {
              $map: {
                input: "$trainers",
                as: "t",
                in: "$$t.fullName"
              }
            },
            location: "$locationOrLink",
            status: 1
          }
        },

        // 6️⃣ Pagination
        {
          $facet: {
            data: [
              { $sort: { date: -1 } },
              { $skip: page * limit },
              { $limit: limit }
            ],
            meta: [{ $count: "total" }]
          }
        }
      ];

      const result =
        await this.trainingRepo.aggregate(pipeline).toArray();

      const data = result[0]?.data || [];
      const total = result[0]?.meta[0]?.total || 0;

      return pagination(total, data, limit, page, res);

    } catch (error) {
      console.error(error);
      return response(res, 500, "Failed to fetch training report");
    }
  }

  @Get("/trainings-report/export")
  async exporttrainingReport(
    @QueryParams() query: any,
    @Res() res: Response
  ) {
    try {

      const { fromDate, toDate, format = "csv" } = query;

      if (!fromDate || !toDate) {
        return res.status(400).json({
          success: false,
          message: "fromDate and toDate are required"
        });
      }

      const start = new Date(`${fromDate}T00:00:00+05:30`);
      const end = new Date(`${toDate}T23:59:59.999+05:30`);
      if (start > end) {
        return res.status(400).json({
          success: false,
          message: "fromDate cannot be greater than toDate"
        });
      }


      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Invalid date format"
        });
      }

      const generatedAtText = `Report Generated at: ${this.formatDateTime(new Date())}`;

      const search = query.search?.toString();

      const pipeline: any[] = [

        {
          $match: {
            isDelete: 0,
            trainingDateTime: {
              $gte: start,
              $lte: end
            }
          }
        },

        {
          $lookup: {
            from: "chapters",
            let: { chapterIds: "$chapterIds" },
            pipeline: [
              {
                $match: {
                  $expr: { $in: ["$_id", "$$chapterIds"] }
                }
              },
              {
                $project: {
                  _id: 1,
                  zoneId: 1,
                  regionId: 1,
                  edId: 1,
                  rdId: 1
                }
              }
            ],
            as: "chapters"
          }
        },

        {
          $lookup: {
            from: "adminusers",
            let: { trainerIds: "$trainerIds" },
            pipeline: [
              {
                $match: {
                  $expr: { $in: ["$_id", "$$trainerIds"] }
                }
              },
              {
                $project: {
                  _id: 1,
                  fullName: "$name"
                }
              }
            ],
            as: "trainers"
          }
        },

        ...(query.chapterId && ObjectId.isValid(query.chapterId)
          ? [{ $match: { "chapters._id": new ObjectId(query.chapterId) } }]
          : []),

        ...(query.zoneId && ObjectId.isValid(query.zoneId)
          ? [{ $match: { "chapters.zoneId": new ObjectId(query.zoneId) } }]
          : []),

        ...(query.regionId && ObjectId.isValid(query.regionId)
          ? [{ $match: { "chapters.regionId": new ObjectId(query.regionId) } }]
          : []),

        ...(query.edId && ObjectId.isValid(query.edId)
          ? [{ $match: { "chapters.edId": new ObjectId(query.edId) } }]
          : []),

        ...(query.rdId && ObjectId.isValid(query.rdId)
          ? [{ $match: { "chapters.rdId": new ObjectId(query.rdId) } }]
          : []),

        ...(search
          ? [{
            $match: {
              $or: [
                { title: { $regex: search, $options: "i" } },
                { "trainers.fullName": { $regex: search, $options: "i" } }
              ]
            }
          }]
          : []),

        {
          $project: {
            _id: 1,
            date: "$trainingDateTime",
            title: 1,
            trainerNames: {
              $map: {
                input: "$trainers",
                as: "t",
                in: "$$t.fullName"
              }
            },
            location: "$locationOrLink",
            status: 1
          }
        },
        { $sort: { date: -1 } },
      ];

      const cursor =
        await this.trainingRepo.aggregate(pipeline).toArray();


      if (format === "pdf") {
        const doc = new PDFDocument({ size: "A4", margin: 30 });

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          "attachment; filename=Training_report.pdf"
        );

        doc.pipe(res);

        const logoPath = path.resolve(process.cwd(), "uploads", "logo.png");



        const pageWidth = doc.page.width;
        const pageHeight = doc.page.height;
        const margin = 30;
        const contentWidth = pageWidth - margin * 2;

        const HEADER_Y = 145;
        const TABLE_HEADER_HEIGHT = 38;
        const FOOTER_Y = pageHeight - 85;


        const drawHeader = () => {
          if (fs.existsSync(logoPath)) {
            doc.image(logoPath, margin, 35, { width: 65 });
          }

          doc.font("Helvetica-Bold").fontSize(22).fillColor(this.pdfColors.navyBlue);
          doc.text(this.orgName, margin + 80, 42);

          doc.fontSize(14).fillColor(this.pdfColors.red);
          doc.text("Training Report", margin + 80, 66);

          const boxX = pageWidth - margin - 185;
          const boxY = 38;

          doc
            .roundedRect(boxX, boxY, 185, 58, 6)
            .fillAndStroke(this.pdfColors.navyLight, this.pdfColors.navyBlue);

          doc.fontSize(10).fillColor(this.pdfColors.navyBlue);
          doc.text("Report Period", boxX + 12, boxY + 10);

          doc.fontSize(9).fillColor(this.pdfColors.text);
          doc.text(`From:  ${this.formatDateOnly(fromDate)}`, boxX + 12, boxY + 26);
          doc.text(`To : ${this.formatDateOnly(toDate)}`, boxX + 12, boxY + 38);

          doc
            .font("Helvetica")
            .fontSize(7)
            .fillColor(this.pdfColors.textLight)
            .text(generatedAtText, margin, 110);

          doc.strokeColor(this.pdfColors.navyBlue).lineWidth(2.5)
            .moveTo(margin, 125)
            .lineTo(pageWidth - margin, 125)
            .stroke();

          doc.strokeColor(this.pdfColors.red).lineWidth(1)
            .moveTo(margin, 128)
            .lineTo(pageWidth - margin, 128)
            .stroke();
        };


        const drawTableHeader = (y: number) => {
          doc.rect(margin, y, contentWidth, 30).fill(this.pdfColors.navyBlue);
          doc.rect(margin, y, contentWidth, 3).fill(this.pdfColors.red);

          const columns = [
            { text: "S.No", x: margin + 10, width: 30 },
            { text: "Date", x: margin + 45, width: 90 },
            { text: "Training Title", x: margin + 140, width: 85 },
            { text: "Training Name", x: margin + 230, width: 85 },
            { text: "Location", x: margin + 320, width: 80 },
            { text: "Status", x: margin + 405, width: 90 }
          ];

          doc.font("Helvetica-Bold").fontSize(9).fillColor(this.pdfColors.white);
          columns.forEach(col =>
            doc.text(col.text, col.x, y + 10, { width: col.width, align: "left" })
          );
        };


        const drawRow = (y: number, index: number, row: any, alt: boolean, rowHeight: number) => {
          if (alt) {
            doc.rect(margin, y - 3, contentWidth, rowHeight).fill(this.pdfColors.rowAlt);
          }

          const getCenteredY = (text: string, width: number) => {
            const h = doc.heightOfString(text || "-", { width });
            return y + (rowHeight - h) / 2 - 2;
          };

          doc.font("Helvetica").fontSize(9).fillColor(this.pdfColors.text);
          doc.text(String(index), margin + 10, getCenteredY(String(index), 30), { width: 30, align: "left" });

          const trainingDate = this.formatDate(row.date);
          doc.text(trainingDate, margin + 45, getCenteredY(trainingDate, 90), { width: 90, lineBreak: true, align: "left" });
          doc.text(row.title || "-", margin + 140, getCenteredY(row.title, 85), { width: 85, lineBreak: true, align: "left" });
          const trainers = Array.isArray(row.trainerNames) ? row.trainerNames.join(", ") : (row.trainerNames || "-");
          doc.text(trainers, margin + 230, getCenteredY(trainers, 85), { width: 85, lineBreak: true, align: "left" });
          doc.text(row.location || "-", margin + 320, getCenteredY(row.location, 80), { width: 80, lineBreak: true, align: "left" });

          doc.text(row.status || "-", margin + 405, getCenteredY(row.status, 90), {
            width: 90,
            lineBreak: true, align: "left"
          });
        };


        const drawFooter = (pageNum: number, total: number) => {
          doc.strokeColor(this.pdfColors.navyBlue).lineWidth(1)
            .moveTo(margin, FOOTER_Y)
            .lineTo(pageWidth - margin, FOOTER_Y)
            .stroke();

          doc.strokeColor(this.pdfColors.red).lineWidth(0.5)
            .moveTo(margin, FOOTER_Y + 2)
            .lineTo(pageWidth - margin, FOOTER_Y + 2)
            .stroke();

          doc.fontSize(8).fillColor(this.pdfColors.textLight);
          doc.text(
            `Page ${pageNum} of ${total}`,
            margin,
            FOOTER_Y + 8,
            { align: "center" }
          );

          doc.font("Helvetica").fontSize(7).fillColor(this.pdfColors.navyBlue);
          const footerText = "Powered by: Ocean Softwares";
          const textWidth = doc.widthOfString(footerText);
          const startX = pageWidth - margin - textWidth - 5;
          doc.text("Powered by: ", startX, FOOTER_Y + 8, { continued: true, lineBreak: false, width: pageWidth - startX - margin })
            .text("Ocean Softwares", { link: "https://www.oceansoftwares.com/", underline: true, lineBreak: false });
        };

        const rows: any[] = [];
        for await (const r of cursor) rows.push(r);

        doc.font("Helvetica").fontSize(9);

        const rowHeights = rows.map(row => {
          const h1 = doc.heightOfString(row.title || "-", { width: 85 });
          const trainers = Array.isArray(row.trainerNames) ? row.trainerNames.join(", ") : (row.trainerNames || "-");
          const h2 = doc.heightOfString(trainers, { width: 85 });
          const h3 = doc.heightOfString(row.location || "-", { width: 80 });
          const h4 = doc.heightOfString(row.status || "-", { width: 90 });
          return Math.max(h1, h2, h3, h4, 20) + 10;
        });

        let totalPages = 1;
        let tempY = HEADER_Y + TABLE_HEADER_HEIGHT;
        for (let i = 0; i < rows.length; i++) {
          if (tempY + rowHeights[i] > FOOTER_Y - 10) {
            totalPages++;
            tempY = HEADER_Y + TABLE_HEADER_HEIGHT;
          }
          tempY += rowHeights[i];
        }

        let pageNum = 1;
        let index = 1;
        let alt = false;
        let y = HEADER_Y;

        drawHeader();
        drawTableHeader(y);
        y += TABLE_HEADER_HEIGHT;

        for (let i = 0; i < rows.length; i++) {
          const rowHeight = rowHeights[i];

          if (y + rowHeight > FOOTER_Y - 10) {
            drawFooter(pageNum, totalPages);
            doc.addPage();
            pageNum++;

            drawHeader();
            y = HEADER_Y;
            drawTableHeader(y);
            y += TABLE_HEADER_HEIGHT;
            alt = false;
          }

          drawRow(y, index++, rows[i], alt, rowHeight);
          alt = !alt;
          y += rowHeight;
        }

        drawFooter(pageNum, totalPages);
        doc.end();
        return res;
      }

      if (format === "csv") {
        const rows: any[] = [];
        let index = 1;



        for await (const item of cursor) {
          rows.push({
            "S.No": index++,
            "Date": this.formatDate(item.date),
            "Training Title": item.title,
            "Training Name": item.trainerNames,
            "Location": item.location || "-",
            "Status": item.status,
          });
        }

        if (rows.length === 0) {
          return res.status(404).json({
            success: false,
            message: "No data found"
          });
        }

        const parser = new Parser();
        const dataCsv = parser.parse(rows);

        const reportLine = `"${generatedAtText}"\n\n`;
        const csv = reportLine + dataCsv;

        res.setHeader("Content-Type", "text/csv");
        res.setHeader(
          "Content-Disposition",
          "attachment; filename=training_report.csv"
        );

        res.send(csv);
        return res;
      }

      if (format === "excel") {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet("Training Report");

        sheet.addRow([generatedAtText]);
        sheet.mergeCells("A1:G1");
        sheet.getRow(1).font = { italic: true };
        sheet.addRow([]);

        sheet.columns = [
          { header: "S.No", key: "sno", width: 8 },
          { header: "Date", key: "date", width: 20 },
          { header: "Training Title", key: "title", width: 25 },
          { header: "Training Name", key: "trainerNames", width: 25 },
          { header: "Location", key: "location", width: 15 },
          { header: "Status", key: "status", width: 30 }
        ];

        let index = 1;

        for await (const item of cursor) {
          sheet.addRow({
            sno: index++,
            date: this.formatDateTime(item.date),
            title: item.title,
            trainerNames: item.trainerNames,
            location: item.location,
            status: item.status
          });
        }

        res.setHeader(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        res.setHeader(
          "Content-Disposition",
          "attachment; filename=training_report.xlsx"
        );

        await workbook.xlsx.write(res);
        res.end();
        return res;
      }

      return res.status(400).json({
        success: false,
        message: "Invalid format. Use csv | excel | pdf"
      });


    } catch (error) {
      console.error(error);
      return response(res, 500, "Failed to export training report");
    }
  }

  @Get("/member-suggestion-report/export")
  async exportMemberSuggestionReport(
    @QueryParams() query: any,
    @Res() res: Response
  ) {
    try {

      const { fromDate, toDate, format = "csv" } = query;

      if (!fromDate || !toDate) {
        return res.status(400).json({
          success: false,
          message: "fromDate and toDate are required"
        });
      }

      const start = new Date(`${fromDate}T00:00:00+05:30`);
      const end = new Date(`${toDate}T23:59:59.999+05:30`);
      if (start > end) {
        return res.status(400).json({
          success: false,
          message: "fromDate cannot be greater than toDate"
        });
      }


      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Invalid date format"
        });
      }

      const generatedAtText = `Report Generated at: ${this.formatDateTime(new Date())}`;

      const pipeline: any[] = [
        {
          $match: {
            isDelete: 0,
            createdAt: {
              $gte: start,
              $lte: end
            }
          }
        },

        {
          $lookup: {
            from: "member",
            let: { memberId: "$createdBy" },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ["$_id", "$$memberId"] }
                }
              },
              {
                $project: {
                  _id: 1,
                  fullName: 1,
                  phoneNumber: 1,
                  profileImage: 1,
                  chapter: 1
                }
              }
            ],
            as: "member"
          }
        },
        { $unwind: "$member" },
        {
          $lookup: {
            from: "chapters",
            let: { chapterId: "$member.chapter" },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ["$_id", "$$chapterId"] }
                }
              },
              {
                $project: {
                  _id: 1,
                  chapterName: 1,
                  zoneId: 1,
                  regionId: 1,
                  edId: 1,
                  rdId: 1
                }
              }
            ],
            as: "chapter"
          }
        },
        {
          $unwind: {
            path: "$chapter",
            preserveNullAndEmptyArrays: true
          }
        },

        ...(query.chapterId && ObjectId.isValid(query.chapterId)
          ? [{ $match: { "chapter._id": new ObjectId(query.chapterId) } }]
          : []),

        ...(query.zoneId && ObjectId.isValid(query.zoneId)
          ? [{ $match: { "chapter.zoneId": new ObjectId(query.zoneId) } }]
          : []),

        ...(query.edId && ObjectId.isValid(query.edId)
          ? [{ $match: { "chapter.edId": new ObjectId(query.edId) } }]
          : []),

        ...(query.rdId && ObjectId.isValid(query.rdId)
          ? [{ $match: { "chapter.rdId": new ObjectId(query.rdId) } }]
          : []),
        ...(query.search
          ? [{
            $match: {
              $or: [
                { "chapter.chapterName": { $regex: query.search, $options: "i" } },
                { "member.fullName": { $regex: query.search, $options: "i" } },
                { "member.phoneNumber": { $regex: query.search, $options: "i" } },
                { subject: { $regex: query.search, $options: "i" } },
                { message: { $regex: query.search, $options: "i" } },
              ]
            }
          }]
          : []),

        {
          $project: {
            _id: 1,
            fullName: "$member.fullName",
            profileImage: "$member.profileImage",
            mobileNumber: "$member.phoneNumber",
            chapterName: "$chapter.chapterName",
            subject: 1,
            message: 1,
            status: 1,
            createdAt: 1
          }
        },
      ];

      const cursor = await this.repo.aggregate(pipeline).toArray();

      if (format === "pdf") {
        const doc = new PDFDocument({ size: "A4", margin: 30 });

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          "attachment; filename=Member_suggestion_report.pdf"
        );

        doc.pipe(res);

        const logoPath = path.resolve(process.cwd(), "uploads", "logo.png");



        const pageWidth = doc.page.width;
        const pageHeight = doc.page.height;
        const margin = 30;
        const contentWidth = pageWidth - margin * 2;

        const HEADER_Y = 145;
        const TABLE_HEADER_HEIGHT = 38;
        const FOOTER_Y = pageHeight - 85;


        const drawHeader = () => {
          if (fs.existsSync(logoPath)) {
            doc.image(logoPath, margin, 35, { width: 65 });
          }

          doc.font("Helvetica-Bold").fontSize(22).fillColor(this.pdfColors.navyBlue);
          doc.text(this.orgName, margin + 80, 42);

          doc.fontSize(14).fillColor(this.pdfColors.red);
          doc.text("Member Suggestion Report", margin + 80, 66);

          const boxX = pageWidth - margin - 185;
          const boxY = 38;

          doc
            .roundedRect(boxX, boxY, 185, 58, 6)
            .fillAndStroke(this.pdfColors.navyLight, this.pdfColors.navyBlue);

          doc.fontSize(10).fillColor(this.pdfColors.navyBlue);
          doc.text("Report Period", boxX + 12, boxY + 10);

          doc.fontSize(9).fillColor(this.pdfColors.text);
          doc.text(`From:  ${this.formatDateOnly(fromDate)}`, boxX + 12, boxY + 26);
          doc.text(`To : ${this.formatDateOnly(toDate)}`, boxX + 12, boxY + 38);

          doc
            .font("Helvetica")
            .fontSize(7)
            .fillColor(this.pdfColors.textLight)
            .text(generatedAtText, margin, 110);

          doc.strokeColor(this.pdfColors.navyBlue).lineWidth(2.5)
            .moveTo(margin, 125)
            .lineTo(pageWidth - margin, 125)
            .stroke();

          doc.strokeColor(this.pdfColors.red).lineWidth(1)
            .moveTo(margin, 128)
            .lineTo(pageWidth - margin, 128)
            .stroke();
        };


        const drawTableHeader = (y: number) => {
          doc.rect(margin, y, contentWidth, 30).fill(this.pdfColors.navyBlue);
          doc.rect(margin, y, contentWidth, 3).fill(this.pdfColors.red);

          const columns = [
            { text: "S.No", x: margin + 10, width: 30 },
            { text: "Date", x: margin + 45, width: 90 },
            { text: "Name", x: margin + 140, width: 85 },
            { text: "Chapter", x: margin + 230, width: 85 },
            { text: "Mobile Number", x: margin + 320, width: 80 },
            { text: "Subject", x: margin + 405, width: 90 }
          ];

          doc.font("Helvetica-Bold").fontSize(9).fillColor(this.pdfColors.white);
          columns.forEach(col =>
            doc.text(col.text, col.x, y + 10, { width: col.width, align: "left" })
          );
        };


        const drawRow = (y: number, index: number, row: any, alt: boolean, rowHeight: number) => {
          if (alt) {
            doc.rect(margin, y - 3, contentWidth, rowHeight).fill(this.pdfColors.rowAlt);
          }

          const getCenteredY = (text: string, width: number) => {
            const h = doc.heightOfString(text || "-", { width });
            return y + (rowHeight - h) / 2 - 2;
          };

          doc.font("Helvetica").fontSize(9).fillColor(this.pdfColors.text);
          doc.text(String(index), margin + 10, getCenteredY(String(index), 30), { width: 30, align: "left" });

          const suggestionDate = this.formatDate(row.createdAt);
          doc.text(suggestionDate, margin + 45, getCenteredY(suggestionDate, 90), { width: 90, lineBreak: true, align: "left" });
          doc.text(row.fullName || "-", margin + 140, getCenteredY(row.fullName, 85), { width: 85, lineBreak: true, align: "left" });
          doc.text(row.chapterName || "-", margin + 230, getCenteredY(row.chapterName, 85), { width: 85, lineBreak: true, align: "left" });
          doc.text(row.mobileNumber || "-", margin + 320, getCenteredY(row.mobileNumber, 80), { width: 80, lineBreak: true, align: "left" });

          doc.text(row.subject || "-", margin + 405, getCenteredY(row.subject, 90), {
            width: 90,
            lineBreak: true, align: "left"
          });
        };


        const drawFooter = (pageNum: number, total: number) => {
          doc.strokeColor(this.pdfColors.navyBlue).lineWidth(1)
            .moveTo(margin, FOOTER_Y)
            .lineTo(pageWidth - margin, FOOTER_Y)
            .stroke();

          doc.strokeColor(this.pdfColors.red).lineWidth(0.5)
            .moveTo(margin, FOOTER_Y + 2)
            .lineTo(pageWidth - margin, FOOTER_Y + 2)
            .stroke();

          doc.fontSize(8).fillColor(this.pdfColors.textLight);
          doc.text(
            `Page ${pageNum} of ${total}`,
            margin,
            FOOTER_Y + 8,
            { align: "center" }
          );

          doc.font("Helvetica").fontSize(7).fillColor(this.pdfColors.navyBlue);
          const footerText = "Powered by: Ocean Softwares";
          const textWidth = doc.widthOfString(footerText);
          const startX = pageWidth - margin - textWidth - 5;
          doc.text("Powered by: ", startX, FOOTER_Y + 8, { continued: true, lineBreak: false, width: pageWidth - startX - margin })
            .text("Ocean Softwares", { link: "https://www.oceansoftwares.com/", underline: true, lineBreak: false });
        };

        const rows: any[] = [];
        for await (const r of cursor) rows.push(r);

        doc.font("Helvetica").fontSize(9);

        const rowHeights = rows.map(row => {
          const h1 = doc.heightOfString(row.fullName || "-", { width: 85 });
          const h2 = doc.heightOfString(row.chapterName || "-", { width: 85 });
          const h3 = doc.heightOfString(row.subject || "-", { width: 90 });
          return Math.max(h1, h2, h3, 20) + 10;
        });

        let totalPages = 1;
        let tempY = HEADER_Y + TABLE_HEADER_HEIGHT;
        for (let i = 0; i < rows.length; i++) {
          if (tempY + rowHeights[i] > FOOTER_Y - 10) {
            totalPages++;
            tempY = HEADER_Y + TABLE_HEADER_HEIGHT;
          }
          tempY += rowHeights[i];
        }

        let pageNum = 1;
        let index = 1;
        let alt = false;
        let y = HEADER_Y;

        drawHeader();
        drawTableHeader(y);
        y += TABLE_HEADER_HEIGHT;

        for (let i = 0; i < rows.length; i++) {
          const rowHeight = rowHeights[i];

          if (y + rowHeight > FOOTER_Y - 10) {
            drawFooter(pageNum, totalPages);
            doc.addPage();
            pageNum++;

            drawHeader();
            y = HEADER_Y;
            drawTableHeader(y);
            y += TABLE_HEADER_HEIGHT;
            alt = false;
          }

          drawRow(y, index++, rows[i], alt, rowHeight);
          alt = !alt;
          y += rowHeight;
        }

        drawFooter(pageNum, totalPages);
        doc.end();
        return res;
      }

      if (format === "csv") {
        const rows: any[] = [];
        let index = 1;



        for await (const item of cursor) {
          rows.push({
            "S.No": index++,
            "Date": this.formatDate(item.createdAt),
            "Name": item.fullName,
            "Chapter": item.chapterName,
            "Mobile Number": item.mobileNumber || "-",
            "Subject": item.subject,
            "Message": item.message
          });
        }

        if (rows.length === 0) {
          return res.status(404).json({
            success: false,
            message: "No data found"
          });
        }

        const parser = new Parser();
        const dataCsv = parser.parse(rows);

        const reportLine = `"${generatedAtText}"\n\n`;
        const csv = reportLine + dataCsv;

        res.setHeader("Content-Type", "text/csv");
        res.setHeader(
          "Content-Disposition",
          "attachment; filename=member_suggestion_report.csv"
        );

        res.send(csv);
        return res;
      }

      if (format === "excel") {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet("Member Suggestion Report");

        sheet.addRow([generatedAtText]);
        sheet.mergeCells("A1:G1");
        sheet.getRow(1).font = { italic: true };
        sheet.addRow([]);

        sheet.columns = [
          { header: "S.No", key: "sno", width: 8 },
          { header: "Date", key: "createdAt", width: 20 },
          { header: "Name", key: "fullName", width: 25 },
          { header: "Chapter", key: "chapterName", width: 25 },
          { header: "Mobile Number", key: "mobileNumber", width: 15 },
          { header: "Subject", key: "Subject", width: 30 },
          { header: "Message", key: "message", width: 30 }
        ];

        let index = 1;

        for await (const item of cursor) {
          sheet.addRow({
            sno: index++,
            createdAt: this.formatDateTime(item.createdAt),
            fullName: item.fullName,
            chapterName: item.chapterName,
            mobileNumber: item.mobileNumber,
            Subject: item.Subject,
            Message: item.message
          });
        }

        res.setHeader(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        res.setHeader(
          "Content-Disposition",
          "attachment; filename=member_suggestion_report.xlsx"
        );

        await workbook.xlsx.write(res);
        res.end();
        return res;
      }


    } catch (error) {
      console.error(error);
      return response(res, 500, "Failed to fetch suggestions");
    }
  }

  @Get("/chapter-report")
  async getChapterReport(
    @QueryParams() query: any,
    @Res() res: Response
  ) {
    try {
      const page = Math.max(Number(query.page) || 0, 0);
      const limit = Math.max(Number(query.limit) || 10, 1);
      const search = query.search?.toString();

      const zoneId = query.zoneId;
      const regionId = query.regionId;
      const edId = query.edId;
      const rdId = query.rdId;

      const match: any = {
        isDelete: 0,
      };

      if (zoneId) match.zoneId = new ObjectId(zoneId);
      if (regionId) match.regionId = new ObjectId(regionId);
      if (edId) match.edId = new ObjectId(edId);
      if (rdId) match.rdId = new ObjectId(rdId);

      if (search) {
        match.chapterName = { $regex: search, $options: "i" };
      }

      const pipeline: any[] = [
        { $match: match },

        // 🔹 Lookups for ED, RD, Zone to display names
        {
          $lookup: {
            from: "member",
            localField: "edId",
            foreignField: "_id",
            as: "ed"
          }
        },
        { $unwind: { path: "$ed", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "member",
            localField: "rdId",
            foreignField: "_id",
            as: "rd"
          }
        },
        { $unwind: { path: "$rd", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "zones",
            localField: "zoneId",
            foreignField: "_id",
            as: "zone"
          }
        },
        { $unwind: { path: "$zone", preserveNullAndEmptyArrays: true } },

        // 🔹 GET MEMBERS of this chapter
        {
          $lookup: {
            from: "member",
            let: { chapterId: "$_id" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ["$chapter", "$$chapterId"] },
                      { $eq: ["$isDelete", 0] },
                    ]
                  }
                }
              },
              { $project: { _id: 1 } }
            ],
            as: "members"
          }
        },
        {
          $addFields: {
            memberIds: { $map: { input: "$members", as: "m", in: "$$m._id" } },
            totalMembers: { $size: "$members" }
          }
        },

        // 🔹 AGGREGATE STATS based on memberIds

        // 1. OneToOne (Initiated By Member)
        {
          $lookup: {
            from: "one_to_one_meetings",
            let: { mIds: "$memberIds" },
            pipeline: [
              {
                $match: {
                  $expr: { $in: ["$initiatedById", "$$mIds"] },
                  isDelete: 0
                }
              },
              { $count: "count" }
            ],
            as: "oneToOneStats"
          }
        },

        // 2. Referrals (From Member)
        {
          $lookup: {
            from: "referrals",
            let: { mIds: "$memberIds" },
            pipeline: [
              {
                $match: {
                  $expr: { $in: ["$fromMemberId", "$$mIds"] },
                  isDelete: 0
                }
              },
              { $count: "count" }
            ],
            as: "referralStats"
          }
        },

        // 3. Visitors (Created By Member)
        {
          $lookup: {
            from: "visitors",
            let: { mIds: "$memberIds" },
            pipeline: [
              {
                $match: {
                  $expr: { $in: ["$createdBy", "$$mIds"] },
                  isDelete: 0
                }
              },
              { $count: "count" }
            ],
            as: "visitorStats"
          }
        },

        // 4. Chief Guests (Created By Member)
        {
          $lookup: {
            from: "mobile_chief_guest",
            let: { mIds: "$memberIds" },
            pipeline: [
              {
                $match: {
                  $expr: { $in: ["$createdBy", "$$mIds"] },
                  isDelete: 0
                }
              },
              { $count: "count" }
            ],
            as: "chiefGuestStats"
          }
        },

        // 5. Power Dates (Created By Member)
        {
          $lookup: {
            from: "power_date",
            let: { mIds: "$memberIds" },
            pipeline: [
              {
                $match: {
                  $expr: { $in: ["$createdBy", "$$mIds"] },
                  isDelete: 0
                }
              },
              { $count: "count" }
            ],
            as: "powerDateStats"
          }
        },

        // 6. Trainings (Attendance: source=TRAINING)
        {
          $lookup: {
            from: "attendance",
            let: { mIds: "$memberIds" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $in: ["$memberId", "$$mIds"] },
                      { $eq: ["$sourceType", "TRAINING"] },
                      { $eq: ["$status", "present"] },
                      { $eq: ["$isDelete", 0] }
                    ]
                  }
                }
              },
              { $count: "count" }
            ],
            as: "trainingStats"
          }
        },

        // 7. Thank You Slips (Given By Member - createdBy)
        {
          $lookup: {
            from: "thank_you_slips",
            let: { mIds: "$memberIds" },
            pipeline: [
              {
                $match: {
                  $expr: { $in: ["$createdBy", "$$mIds"] },
                  isDelete: 0
                }
              },
              { $group: { _id: null, totalAmount: { $sum: "$amount" } } }
            ],
            as: "thankYouStats"
          }
        },

        // 🔹 Final Project
        {
          $project: {
            _id: 1,
            chapterName: 1,
            location: 1,
            zoneName: "$zone.name",
            zoneState: "$zone.state",
            edName: "$ed.fullName",
            rdName: "$rd.fullName",
            totalMembers: 1,
            oneToOneCount: { $ifNull: [{ $arrayElemAt: ["$oneToOneStats.count", 0] }, 0] },
            referralCount: { $ifNull: [{ $arrayElemAt: ["$referralStats.count", 0] }, 0] },
            visitorCount: { $ifNull: [{ $arrayElemAt: ["$visitorStats.count", 0] }, 0] },
            chiefGuestCount: { $ifNull: [{ $arrayElemAt: ["$chiefGuestStats.count", 0] }, 0] },
            powerDateCount: { $ifNull: [{ $arrayElemAt: ["$powerDateStats.count", 0] }, 0] },
            trainingCount: { $ifNull: [{ $arrayElemAt: ["$trainingStats.count", 0] }, 0] },
            thankYouSlipAmount: { $ifNull: [{ $arrayElemAt: ["$thankYouStats.totalAmount", 0] }, 0] },
            createdAt: 1
          }
        },

        { $sort: { createdAt: -1 } },

        // 🔹 Facet for pagination
        {
          $facet: {
            data: [
              { $skip: page * limit },
              { $limit: limit }
            ],
            meta: [{ $count: "total" }]
          }
        }
      ];

      const chapterRepo = AppDataSource.getMongoRepository(Chapter);
      const result = await chapterRepo.aggregate(pipeline).toArray();

      const data = result[0]?.data || [];
      const total = result[0]?.meta[0]?.total || 0;

      return pagination(total, data, limit, page, res);

    } catch (error) {
      console.error(error);
      return response(res, 500, "Failed to fetch chapter report");
    }
  }

  @Get("/chapter-report/export")
  async exportChapterReport(
    @QueryParams() query: any,
    @Res() res: Response
  ): Promise<Response | void> {
    try {
      const { fromDate, toDate, format = "csv" } = query;

      let start: Date, end: Date;
      if (fromDate && toDate) {
        start = new Date(fromDate);
        end = new Date(toDate);
        end.setHours(23, 59, 59, 999);
      }

      const match: any = {
        isDelete: 0,
      };

      if (query.chapterId && ObjectId.isValid(query.chapterId)) {
        match._id = new ObjectId(query.chapterId);
      }
      if (query.zoneId && ObjectId.isValid(query.zoneId)) {
        match.zoneId = new ObjectId(query.zoneId);
      }
      if (query.edId && ObjectId.isValid(query.edId)) {
        match.edId = new ObjectId(query.edId);
      }
      if (query.rdId && ObjectId.isValid(query.rdId)) {
        match.rdId = new ObjectId(query.rdId);
      }

      const pipeline: any[] = [
        { $match: match },
        {
          $lookup: {
            from: "member",
            localField: "edId",
            foreignField: "_id",
            as: "ed"
          }
        },
        { $unwind: { path: "$ed", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "member",
            localField: "rdId",
            foreignField: "_id",
            as: "rd"
          }
        },
        { $unwind: { path: "$rd", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "zones",
            localField: "zoneId",
            foreignField: "_id",
            as: "zone"
          }
        },
        { $unwind: { path: "$zone", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "member",
            let: { chapterId: "$_id" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ["$chapter", "$$chapterId"] },
                      { $eq: ["$isDelete", 0] },
                    ]
                  }
                }
              },
              { $project: { _id: 1 } }
            ],
            as: "members"
          }
        },
        {
          $addFields: {
            memberIds: { $map: { input: "$members", as: "m", in: "$$m._id" } },
            totalMembers: { $size: "$members" }
          }
        },
        {
          $lookup: {
            from: "one_to_one_meetings",
            let: { mIds: "$memberIds" },
            pipeline: [
              {
                $match: {
                  $expr: { $in: ["$initiatedById", "$$mIds"] },
                  isDelete: 0,
                  ...(start && end ? { meetingDateTime: { $gte: start, $lte: end } } : {})
                }
              },
              { $count: "count" }
            ],
            as: "oneToOneStats"
          }
        },
        {
          $lookup: {
            from: "referrals",
            let: { mIds: "$memberIds" },
            pipeline: [
              {
                $match: {
                  $expr: { $in: ["$fromMemberId", "$$mIds"] },
                  isDelete: 0,
                  ...(start && end ? { createdAt: { $gte: start, $lte: end } } : {})
                }
              },
              { $count: "count" }
            ],
            as: "referralStats"
          }
        },
        {
          $lookup: {
            from: "visitors",
            let: { mIds: "$memberIds" },
            pipeline: [
              {
                $match: {
                  $expr: { $in: ["$createdBy", "$$mIds"] },
                  isDelete: 0,
                  ...(start && end ? { visitDate: { $gte: start, $lte: end } } : {})
                }
              },
              { $count: "count" }
            ],
            as: "visitorStats"
          }
        },
        {
          $lookup: {
            from: "mobile_chief_guest",
            let: { mIds: "$memberIds" },
            pipeline: [
              {
                $match: {
                  $expr: { $in: ["$createdBy", "$$mIds"] },
                  isDelete: 0,
                  ...(start && end ? { createdAt: { $gte: start, $lte: end } } : {})
                }
              },
              { $count: "count" }
            ],
            as: "chiefGuestStats"
          }
        },
        {
          $lookup: {
            from: "power_date",
            let: { mIds: "$memberIds" },
            pipeline: [
              {
                $match: {
                  $expr: { $in: ["$createdBy", "$$mIds"] },
                  isDelete: 0,
                  ...(start && end ? { createdAt: { $gte: start, $lte: end } } : {})
                }
              },
              { $count: "count" }
            ],
            as: "powerDateStats"
          }
        },
        {
          $lookup: {
            from: "attendance",
            let: { mIds: "$memberIds" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $in: ["$memberId", "$$mIds"] },
                      { $eq: ["$sourceType", "TRAINING"] },
                      { $eq: ["$status", "present"] },
                      { $eq: ["$isDelete", 0] },
                      ...(start && end ? [{ $gte: ["$createdAt", start] }, { $lte: ["$createdAt", end] }] : [])
                    ]
                  }
                }
              },
              { $count: "count" }
            ],
            as: "trainingStats"
          }
        },
        {
          $lookup: {
            from: "thank_you_slips",
            let: { mIds: "$memberIds" },
            pipeline: [
              {
                $match: {
                  $expr: { $in: ["$createdBy", "$$mIds"] },
                  isDelete: 0,
                  ...(start && end ? { createdAt: { $gte: start, $lte: end } } : {})
                }
              },
              { $group: { _id: null, totalAmount: { $sum: "$amount" } } }
            ],
            as: "thankYouStats"
          }
        },
        {
          $project: {
            chapterName: 1,
            location: 1,
            zoneName: "$zone.name",
            zoneState: "$zone.state",
            edName: "$ed.fullName",
            rdName: "$rd.fullName",
            totalMembers: 1,
            oneToOneCount: { $ifNull: [{ $arrayElemAt: ["$oneToOneStats.count", 0] }, 0] },
            referralCount: { $ifNull: [{ $arrayElemAt: ["$referralStats.count", 0] }, 0] },
            visitorCount: { $ifNull: [{ $arrayElemAt: ["$visitorStats.count", 0] }, 0] },
            chiefGuestCount: { $ifNull: [{ $arrayElemAt: ["$chiefGuestStats.count", 0] }, 0] },
            powerDateCount: { $ifNull: [{ $arrayElemAt: ["$powerDateStats.count", 0] }, 0] },
            trainingCount: { $ifNull: [{ $arrayElemAt: ["$trainingStats.count", 0] }, 0] },
            thankYouSlipAmount: { $ifNull: [{ $arrayElemAt: ["$thankYouStats.totalAmount", 0] }, 0] },
            createdAt: 1
          }
        },
        { $sort: { createdAt: -1 } }
      ];

      const chapterRepo = AppDataSource.getMongoRepository(Chapter);
      const data = await chapterRepo.aggregate(pipeline).toArray();

      if (!data || data.length === 0) {
        return res.status(404).json({
          success: false,
          message: "No data found for the given filters"
        });
      }

      const generatedAtText = `Report Generated at: ${this.formatDateTime(new Date())}`;

      if (format === "pdf") {
        const doc = new PDFDocument({ size: "A4", margin: 30 });
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", "attachment; filename=chapter_report.pdf");
        doc.pipe(res);



        const pageWidth = doc.page.width;
        const pageHeight = doc.page.height;
        const margin = 30;
        const contentWidth = pageWidth - margin * 2;

        const drawHeader = () => {
          const logoPath = path.resolve(process.cwd(), "uploads", "logo.png");
          if (fs.existsSync(logoPath)) {
            doc.image(logoPath, margin, 35, { width: 65 });
          }

          doc.font("Helvetica-Bold").fontSize(22).fillColor(this.pdfColors.navyBlue);
          doc.text(this.orgName, margin + 80, 42);

          doc.fontSize(14).fillColor(this.pdfColors.red);
          doc.text("Chapter Report", margin + 80, 66);

          if (fromDate && toDate) {
            const boxX = pageWidth - margin - 185;
            const boxY = 38;
            doc.roundedRect(boxX, boxY, 185, 58, 6).fillAndStroke(this.pdfColors.navyLight, this.pdfColors.navyBlue);
            doc.fontSize(10).fillColor(this.pdfColors.navyBlue).font("Helvetica-Bold");
            doc.text("Report Period", boxX + 12, boxY + 10);
            doc.fontSize(9).fillColor(this.pdfColors.text).font("Helvetica");
            doc.text(`From:  ${this.formatDateOnly(fromDate)}`, boxX + 12, boxY + 26);
            doc.text(`To : ${this.formatDateOnly(toDate)}`, boxX + 12, boxY + 38);
          }

          doc.font("Helvetica").fontSize(7).fillColor(this.pdfColors.textLight)
            .text(generatedAtText, margin, 110);

          doc.strokeColor(this.pdfColors.navyBlue).lineWidth(2.5)
            .moveTo(margin, 125)
            .lineTo(pageWidth - margin, 125)
            .stroke();

          doc.strokeColor(this.pdfColors.red).lineWidth(1)
            .moveTo(margin, 128)
            .lineTo(pageWidth - margin, 128)
            .stroke();
        };

        const CARD_W = (contentWidth - 20) / 2;
        const CARD_H = 330; // Reduced height to fit 2 rows per page without overlap

        const drawChapterCard = (x: number, y: number, item: any) => {
          let currentY = y;

          // 1. HEADER (Gradient)
          const headerHeight = 55;
          const grad = doc.linearGradient(x, currentY, x + CARD_W, currentY);
          grad.stop(0, "#b91c1c").stop(1, "#1e1b4b");

          doc.roundedRect(x, currentY, CARD_W, headerHeight, 10).fill(grad);

          doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(12);
          doc.text(item.chapterName?.toUpperCase() || "CHAPTER", x + 15, currentY + 12, { width: CARD_W - 60, align: "center" });

          doc.fontSize(8).font("Helvetica");
          doc.text(`${item.zoneState || ""} | ${item.zoneName || ""}`, x + 15, currentY + 32, { width: CARD_W - 60, align: "center" });

          doc.fontSize(18).font("Helvetica-Bold").text(String(item.totalMembers || 0), x + CARD_W - 50, currentY + 10, { width: 40, align: "right" });
          doc.fontSize(7).font("Helvetica").text("MEMBERS", x + CARD_W - 55, currentY + 32, { width: 45, align: "right" });

          currentY += headerHeight + 10;

          // 2. DIRECTORS
          const dirW = (CARD_W - 12) / 2;
          const dirH = 40;

          // ED
          doc.roundedRect(x, currentY, dirW, dirH, 6).fill("#f8fafc").stroke("#e2e8f0");
          doc.fillColor(this.pdfColors.textLight).fontSize(6).font("Helvetica-Bold").text("EXECUTIVE DIRECTOR", x + 8, currentY + 8);
          doc.fillColor(this.pdfColors.text).fontSize(9).font("Helvetica-Bold").text(item.edName || "-", x + 8, currentY + 20, { width: dirW - 16 });

          // RD
          doc.roundedRect(x + dirW + 12, currentY, dirW, dirH, 6).fill("#f8fafc").stroke("#e2e8f0");
          doc.fillColor(this.pdfColors.textLight).fontSize(6).font("Helvetica-Bold").text("REGIONAL DIRECTOR", x + dirW + 18, currentY + 8);
          doc.fillColor(this.pdfColors.text).fontSize(9).font("Helvetica-Bold").text(item.rdName || "-", x + dirW + 18, currentY + 20, { width: dirW - 16 });

          currentY += dirH + 10;

          // 3. STATS GRID
          const sW = (CARD_W - 12) / 2;
          const sH = 45;
          const stats = [
            { label: "One to One", value: item.oneToOneCount },
            { label: "Referrals", value: item.referralCount },
            { label: "Visitors", value: item.visitorCount },
            { label: "Chief Guest's", value: item.chiefGuestCount },
            { label: "Power date's", value: item.powerDateCount },
            { label: "Trainings", value: item.trainingCount }
          ];

          for (let i = 0; i < stats.length; i++) {
            const col = i % 2;
            const row = Math.floor(i / 2);
            const sx = x + (col * (sW + 12));
            const sy = currentY + (row * (sH + 8));

            doc.roundedRect(sx, sy, sW, sH, 8).stroke("#f1f5f9");
            doc.circle(sx + 12, sy + 15, 3).fill(this.pdfColors.red);
            doc.fillColor(this.pdfColors.text).fontSize(11).font("Helvetica-Bold").text(String(stats[i].value || 0), sx + sW - 30, sy + 10, { width: 25, align: "right" });
            doc.fillColor(this.pdfColors.textLight).fontSize(8).font("Helvetica").text(stats[i].label, sx + 10, sy + 25);
          }

          currentY += (sH + 8) * 3 + 2;

          // 4. THANK YOU SLIPS
          const tyH = 50;
          doc.roundedRect(x, currentY, CARD_W, tyH, 10).fill("#f0fdf4");
          doc.fillColor("#166534").fontSize(9).font("Helvetica-Bold").text("THANK YOU SLIPS", x + 15, currentY + 12);
          doc.fillColor("#000000").fontSize(14).font("Helvetica-Bold").text(`${item.thankYouSlipAmount || 0}`, x + 15, currentY + 28);
        };

        const chaptersPerPage = 4;
        const totalPages = Math.ceil(data.length / chaptersPerPage);

        for (let i = 0; i < data.length; i += chaptersPerPage) {
          if (i > 0) doc.addPage();
          drawHeader();

          for (let j = 0; j < chaptersPerPage && (i + j) < data.length; j++) {
            const col = j % 2;
            const row = Math.floor(j / 2);
            const x = margin + (col * (CARD_W + 20));
            const y = 115 + (row * (CARD_H + 20));
            drawChapterCard(x, y, data[i + j]);
          }

          const pageNum = Math.floor(i / chaptersPerPage) + 1;
          doc.fontSize(8).fillColor(this.pdfColors.textLight);
          doc.text(`Page ${pageNum} of ${totalPages}`, 0, pageHeight - 70, { align: "center", width: pageWidth });

          doc.font("Helvetica").fontSize(7).fillColor(this.pdfColors.navyBlue);
          const footerText = "Powered by: Ocean Softwares";
          const textWidth = doc.widthOfString(footerText);
          const startX = pageWidth - margin - textWidth - 5;
          doc.text("Powered by: ", startX, pageHeight - 70, { continued: true, lineBreak: false, width: pageWidth - startX - margin })
            .text("Ocean Softwares", { link: "https://www.oceansoftwares.com/", underline: true, lineBreak: false });
        }

        doc.end();
        return res;
      }

      if (format === "excel") {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet("Chapter Report");

        sheet.addRow([generatedAtText]);
        sheet.mergeCells("A1:L1");
        sheet.getRow(1).font = { italic: true };
        sheet.addRow([]);

        sheet.columns = [
          { header: "S.No", key: "sno", width: 8 },
          { header: "Chapter", key: "chapter", width: 20 },
          { header: "Region/Zone", key: "region", width: 25 },
          { header: "ED", key: "ed", width: 20 },
          { header: "RD", key: "rd", width: 20 },
          { header: "Members", key: "members", width: 10 },
          { header: "1-2-1", key: "oneToOne", width: 10 },
          { header: "Referrals", key: "referrals", width: 10 },
          { header: "Visitors", key: "visitors", width: 10 },
          { header: "Chief Guest", key: "cg", width: 10 },
          { header: "Power Meet", key: "pd", width: 10 },
          { header: "Trainings", key: "trainings", width: 10 },
          { header: "TY Slips Amount", key: "tyAmount", width: 20 }
        ];

        data.forEach((item, index) => {
          sheet.addRow({
            sno: index + 1,
            chapter: item.chapterName,
            region: `${item.zoneState || ""}, ${item.zoneName || ""}`,
            ed: item.edName || "-",
            rd: item.rdName || "-",
            members: item.totalMembers || 0,
            oneToOne: item.oneToOneCount || 0,
            referrals: item.referralCount || 0,
            visitors: item.visitorCount || 0,
            cg: item.chiefGuestCount || 0,
            pd: item.powerDateCount || 0,
            trainings: item.trainingCount || 0,
            tyAmount: item.thankYouSlipAmount || 0
          });
        });

        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", "attachment; filename=chapter_report.xlsx");
        await workbook.xlsx.write(res);
        res.end();
        return res;
      }

      // Default CSV
      const csvRows: any[] = [];
      csvRows.push({
        "S.No": "",
        "Chapter": "",
        "Region/Zone": "",
        "ED": "",
        "RD": "",
        "Members": "",
        "1-2-1": "",
        "Referrals": "",
        "Visitors": "",
        "Chief Guest": "",
        "Power Meet": "",
        "Trainings": "",
        "TY Slips Amount": ""
      });
      csvRows.push({ "S.No": generatedAtText });
      csvRows.push({}); // Empty row for spacing

      data.forEach((item, index) => {
        csvRows.push({
          "S.No": index + 1,
          "Chapter": item.chapterName,
          "Region/Zone": `${item.zoneState || ""}, ${item.zoneName || ""}`,
          "ED": item.edName || "-",
          "RD": item.rdName || "-",
          "Members": item.totalMembers || 0,
          "1-2-1": item.oneToOneCount || 0,
          "Referrals": item.referralCount || 0,
          "Visitors": item.visitorCount || 0,
          "Chief Guest": item.chiefGuestCount || 0,
          "Power Meet": item.powerDateCount || 0,
          "Trainings": item.trainingCount || 0,
          "TY Slips Amount": item.thankYouSlipAmount || 0
        });
      });

      const parser = new Parser();
      const dataCsv = parser.parse(csvRows);

      const reportLine = `"${generatedAtText}"\n\n`;
      const csv = reportLine + dataCsv;

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=chapter_report.csv");
      res.status(200).send(csv);
      return res;

    } catch (error) {
      console.error(error);
      return res.status(500).json({
        success: false,
        message: "Failed to export chapter report"
      });
    }
  }

  @Get("/chapter-member-report")
  async getChapterMemberActivities(
    @QueryParams() query: any,
    @Res() res: Response
  ) {
    try {
      const chapterId = query.chapterId;
      if (!chapterId || !ObjectId.isValid(chapterId)) {
        return response(
          res,
          StatusCodes.BAD_REQUEST,
          "Invalid or missing Chapter ID"
        );
      }

      const page = Math.max(Number(query.page) || 0, 0);
      const limit = Math.max(Number(query.limit) || 10, 1);
      const search = query.search?.toString().trim();

      const match: any = {
        chapter: new ObjectId(chapterId),
        isDelete: 0,
      };

      const searchRegex = search ? new RegExp(search, "i") : null;

      const pipeline: any[] = [
        { $match: match },
        { $sort: { fullName: 1 } },
        {
          $facet: {
            data: [
              { $skip: page * limit },
              { $limit: limit },
              {
                $lookup: {
                  from: "businesscategories",
                  let: { catId: "$businessCategory" },
                  pipeline: [
                    {
                      $match: {
                        $expr: { $eq: ["$_id", "$$catId"] },
                      },
                    },
                    {
                      $project: { _id: 0, name: 1 },
                    },
                  ],
                  as: "category",
                },
              },
              {
                $set: {
                  category: { $ifNull: [{ $first: "$category.name" }, null] },
                },
              },
              ...(searchRegex
                ? [
                  {
                    $match: {
                      $or: [
                        { fullName: { $regex: searchRegex } },
                        { category: { $regex: searchRegex } },
                      ],
                    },
                  },
                ]
                : []),

              {
                $lookup: {
                  from: "one_to_one_meetings",
                  let: { mId: "$_id" },
                  pipeline: [
                    {
                      $match: {
                        isDelete: 0,
                        $expr: {
                          $or: [
                            { $eq: ["$createdBy", "$$mId"] },
                            { $eq: ["$meetingWithMemberId", "$$mId"] },
                          ],
                        },
                      },
                    },
                    { $count: "count" },
                  ],
                  as: "oneToOne",
                },
              },

              {
                $lookup: {
                  from: "referrals",
                  let: { mId: "$_id" },
                  pipeline: [
                    {
                      $match: {
                        $expr: { $eq: ["$fromMemberId", "$$mId"] },
                        isDelete: 0,
                      },
                    },
                    { $count: "count" },
                  ],
                  as: "referrals",
                },
              },

              {
                $lookup: {
                  from: "visitors",
                  let: { mId: "$_id" },
                  pipeline: [
                    {
                      $match: {
                        $expr: { $eq: ["$createdBy", "$$mId"] },
                        isDelete: 0,
                      },
                    },
                    { $count: "count" },
                  ],
                  as: "visitors",
                },
              },

              {
                $lookup: {
                  from: "mobile_chief_guest",
                  let: { mId: "$_id" },
                  pipeline: [
                    {
                      $match: {
                        $expr: { $eq: ["$createdBy", "$$mId"] },
                        isDelete: 0,
                      },
                    },
                    { $count: "count" },
                  ],
                  as: "chiefGuests",
                },
              },

              {
                $lookup: {
                  from: "thank_you_slips",
                  let: { mId: "$_id" },
                  pipeline: [
                    {
                      $match: {
                        $expr: { $eq: ["$thankTo", "$$mId"] },
                        isDelete: 0,
                      },
                    },
                    {
                      $group: {
                        _id: null,
                        total: { $sum: "$amount" },
                      },
                    },
                  ],
                  as: "thankYouSlips",
                },
              },

              {
                $lookup: {
                  from: "power_date",
                  let: { mId: "$_id" },
                  pipeline: [
                    {
                      $match: {
                        isDelete: 0,
                        $expr: {
                          $or: [
                            { $eq: ["$createdBy", "$$mId"] },
                            { $in: ["$$mId", "$members"] },
                          ],
                        },
                      },
                    },
                    { $count: "count" },
                  ],
                  as: "powerDates",
                },
              },

              {
                $lookup: {
                  from: "attendance",
                  let: { mId: "$_id" },
                  pipeline: [
                    {
                      $match: {
                        $expr: {
                          $and: [
                            { $eq: ["$memberId", "$$mId"] },
                            { $eq: ["$sourceType", "TRAINING"] },
                            { $eq: ["$status", "present"] },
                            { $eq: ["$isDelete", 0] },
                          ],
                        },
                      },
                    },
                    { $count: "count" },
                  ],
                  as: "trainings",
                },
              },
              {
                $set: {
                  oneToOneCount: { $ifNull: [{ $first: "$oneToOne.count" }, 0] },
                  referralCount: { $ifNull: [{ $first: "$referrals.count" }, 0] },
                  visitorCount: { $ifNull: [{ $first: "$visitors.count" }, 0] },
                  chiefGuestCount: { $ifNull: [{ $first: "$chiefGuests.count" }, 0] },
                  thankYouSlipValue: {
                    $ifNull: [{ $first: "$thankYouSlips.total" }, 0],
                  },
                  powerDateCount: { $ifNull: [{ $first: "$powerDates.count" }, 0] },
                  trainingCount: { $ifNull: [{ $first: "$trainings.count" }, 0] },
                },
              },

              {
                $project: {
                  _id: 1,
                  memberName: "$fullName",
                  category: 1,
                  oneToOneCount: 1,
                  referralCount: 1,
                  visitorCount: 1,
                  chiefGuestCount: 1,
                  thankYouSlipValue: 1,
                  powerDateCount: 1,
                  trainingCount: 1,
                },
              },
            ],

            meta: [{ $count: "total" }],
          },
        },
      ];

      const result = await this.memberRepo.aggregate(pipeline).toArray();
      const data = result[0]?.data || [];
      const total = result[0]?.meta[0]?.total || 0;

      return pagination(total, data, limit, page, res);
    } catch (error) {
      console.log(error);
      return response(res, 500, "Failed to fetch chapter member report");
    }
  }

  @Get("/member-points-report")
  async getMemberPointsDynamic(
    @QueryParams() query: any,
    @Res() res: Response,
    @Req() req: RequestWithUser,

  ) {
    try {
      const page = req.query.page ? parseInt(req.query.page.toString()) : 0;
      const limit = req.query.limit ? parseInt(req.query.limit.toString()) : 10;
      const skip = page * limit;

      const search = req.query.search?.toString();

      const pipeline: any[] = [
        {
          $group: {
            _id: {
              userId: "$userId",
              pointKey: "$pointKey"
            },
            total: { $sum: "$value" }
          }
        },
        {
          $group: {
            _id: "$_id.userId",
            totalPoints: { $sum: "$total" },
            kv: {
              $push: {
                k: "$_id.pointKey",
                v: "$total"
              }
            }
          }
        },
        {
          $addFields: {
            points: { $arrayToObject: "$kv" }
          }
        },
        {
          $lookup: {
            from: "member",
            let: { memberId: "$_id" },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ["$_id", "$$memberId"] }
                }
              },
              {
                $project: {
                  _id: 1,
                  fullName: 1,
                  profileImage: 1,
                  email: 1,
                  phoneNumber: 1,
                  chapter: 1
                }
              }
            ],
            as: "member"
          }
        },
        { $unwind: { path: "$member" } },
        {
          $lookup: {
            from: "chapters",
            localField: "member.chapter",
            foreignField: "_id",
            as: "chapter"
          }
        },
        { $unwind: { path: "$chapter", preserveNullAndEmptyArrays: true } },

        ...(query.chapterId && ObjectId.isValid(query.chapterId)
          ? [{ $match: { "chapter._id": new ObjectId(query.chapterId) } }]
          : []),

        ...(query.zoneId && ObjectId.isValid(query.zoneId)
          ? [{ $match: { "chapter.zoneId": new ObjectId(query.zoneId) } }]
          : []),

        ...(query.edId && ObjectId.isValid(query.edId)
          ? [{ $match: { "chapter.edId": new ObjectId(query.edId) } }]
          : []),

        ...(query.rdId && ObjectId.isValid(query.rdId)
          ? [{ $match: { "chapter.rdId": new ObjectId(query.rdId) } }]
          : []),
        {
          $project: {
            _id: 0,
            memberId: "$_id",
            name: "$member.fullName",
            profileImage: "$member.profileImage",
            email: "$member.email",
            phoneNumber: "$member.phoneNumber",
            totalPoints: 1,
            points: 1
          }
        },
        ...(search ? [{
          $match: {
            $or: [
              { name: { $regex: search, $options: "i" } },
              { phoneNumber: { $regex: search, $options: "i" } }

            ]
          }
        }] : []),
        { $sort: { totalPoints: -1 } },
        {
          $facet: {
            data: [{ $skip: skip }, { $limit: limit }],
            meta: [{ $count: "total" }]
          }
        }
      ];

      const result =
        await AppDataSource
          .getMongoRepository(UserPoints)
          .aggregate(pipeline)
          .toArray();

      const data = result[0]?.data || [];
      const total = result[0]?.meta[0]?.total || 0;

      return pagination(total, data, limit, page, res);

    } catch (error) {
      console.error(error);
      return response(res, 500, "Failed to fetch member points");
    }
  }

  @Get("/member-points-report/export")
  async exportMemberPoints(
    @QueryParams() query: any,
    @Res() res: Response,
    @Req() req: RequestWithUser,
  ): Promise<Response | void> {
    try {
      const { fromDate, toDate, format = "csv" } = query;

      if (!fromDate || !toDate) {
        return res.status(400).json({
          success: false,
          message: "fromDate and toDate are required"
        });
      }

      const start = new Date(`${fromDate}T00:00:00+05:30`);
      const end = new Date(`${toDate}T23:59:59.999+05:30`);
      if (start > end) {
        return res.status(400).json({
          success: false,
          message: "fromDate cannot be greater than toDate"
        });
      }


      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Invalid date format"
        });
      }

      const generatedAtText = `Report Generated at: ${this.formatDateTime(new Date())}`;
      const search = req.query.search?.toString();

      const pipeline: any[] = [
        {
          $match: {
            createdAt: { $gte: start, $lte: end }
          }
        },
        {
          $group: {
            _id: {
              userId: "$userId",
              pointKey: "$pointKey"
            },
            total: { $sum: "$change" }
          }
        },
        {
          $group: {
            _id: "$_id.userId",
            totalPoints: { $sum: "$total" },
            kv: {
              $push: {
                k: "$_id.pointKey",
                v: "$total"
              }
            }
          }
        },
        {
          $addFields: {
            points: { $arrayToObject: "$kv" }
          }
        },
        {
          $lookup: {
            from: "member",
            let: { memberId: "$_id" },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ["$_id", "$$memberId"] }
                }
              },
              {
                $project: {
                  _id: 1,
                  fullName: 1,
                  profileImage: 1,
                  email: 1,
                  phoneNumber: 1,
                  chapter: 1
                }
              }
            ],
            as: "member"
          }
        },
        { $unwind: { path: "$member" } },
        {
          $lookup: {
            from: "chapters",
            localField: "member.chapter",
            foreignField: "_id",
            as: "chapter"
          }
        },
        { $unwind: { path: "$chapter", preserveNullAndEmptyArrays: true } },

        ...(query.chapterId && ObjectId.isValid(query.chapterId)
          ? [{ $match: { "chapter._id": new ObjectId(query.chapterId) } }]
          : []),

        ...(query.zoneId && ObjectId.isValid(query.zoneId)
          ? [{ $match: { "chapter.zoneId": new ObjectId(query.zoneId) } }]
          : []),

        ...(query.edId && ObjectId.isValid(query.edId)
          ? [{ $match: { "chapter.edId": new ObjectId(query.edId) } }]
          : []),

        ...(query.rdId && ObjectId.isValid(query.rdId)
          ? [{ $match: { "chapter.rdId": new ObjectId(query.rdId) } }]
          : []),
        {
          $project: {
            _id: 0,
            memberId: "$_id",
            name: "$member.fullName",
            profileImage: "$member.profileImage",
            email: "$member.email",
            phoneNumber: "$member.phoneNumber",
            chapterName: "$chapter.chapterName",
            totalPoints: 1,
            points: 1
          }
        },
        ...(search ? [{
          $match: {
            $or: [
              { name: { $regex: search, $options: "i" } },
              { phoneNumber: { $regex: search, $options: "i" } }

            ]
          }
        }] : []),
        { $sort: { totalPoints: -1 } }

      ];

      const data =
        await AppDataSource
          .getMongoRepository(UserPointHistory)
          .aggregate(pipeline)
          .toArray();
      if (format === "pdf") {
        const doc = new PDFDocument({ size: "A4", margin: 30 });

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          "attachment; filename=member_points.pdf"
        );

        doc.pipe(res);

        const logoPath = path.resolve(process.cwd(), "uploads", "logo.png");



        const pageWidth = doc.page.width;
        const pageHeight = doc.page.height;
        const margin = 30;
        const contentWidth = pageWidth - margin * 2;

        const HEADER_Y = 145;
        const TABLE_HEADER_HEIGHT = 38;
        const FOOTER_Y = pageHeight - 85;

        const drawHeader = () => {
          if (fs.existsSync(logoPath)) {
            doc.image(logoPath, margin, 35, { width: 65 });
          }

          doc.font("Helvetica-Bold").fontSize(22).fillColor(this.pdfColors.navyBlue);
          doc.text(this.orgName, margin + 80, 42);

          doc.fontSize(14).fillColor(this.pdfColors.red);
          doc.text("Member Points Report", margin + 80, 66);

          const boxX = pageWidth - margin - 185;
          const boxY = 38;

          doc
            .roundedRect(boxX, boxY, 185, 58, 6)
            .fillAndStroke(this.pdfColors.navyLight, this.pdfColors.navyBlue);

          doc.fontSize(10).fillColor(this.pdfColors.navyBlue);
          doc.text("Report Period", boxX + 12, boxY + 10);

          doc.fontSize(9).fillColor(this.pdfColors.text);
          doc.text(`From:  ${this.formatDateOnly(fromDate)}`, boxX + 12, boxY + 26);
          doc.text(`To : ${this.formatDateOnly(toDate)}`, boxX + 12, boxY + 38);

          doc
            .font("Helvetica")
            .fontSize(7)
            .fillColor(this.pdfColors.textLight)
            .text(generatedAtText, margin, 110);

          doc.strokeColor(this.pdfColors.navyBlue).lineWidth(2.5)
            .moveTo(margin, 125)
            .lineTo(pageWidth - margin, 125)
            .stroke();

          doc.strokeColor(this.pdfColors.red).lineWidth(1)
            .moveTo(margin, 128)
            .lineTo(pageWidth - margin, 128)
            .stroke();
        };

        const drawTableHeader = (y: number) => {
          doc.rect(margin, y, contentWidth, 30).fill(this.pdfColors.navyBlue);
          doc.rect(margin, y, contentWidth, 3).fill(this.pdfColors.red);
          const columns = [
            { text: "S.No", x: margin + 10, width: 30 },
            { text: "Member Name", x: margin + 45, width: 200 },
            { text: "Chapter", x: margin + 250, width: 150 },
            { text: "Total Points", x: margin + 410, width: 100 }
          ];

          doc.font("Helvetica-Bold").fontSize(9).fillColor(this.pdfColors.white);
          columns.forEach(col =>
            doc.text(col.text, col.x, y + 10, { width: col.width, align: "left" })
          );
        };

        const drawRow = (y: number, index: number, row: any, alt: boolean, rowHeight: number) => {
          if (alt) {
            doc.rect(margin, y - 3, contentWidth, rowHeight).fill(this.pdfColors.rowAlt);
          }

          const getCenteredY = (text: string, width: number) => {
            const h = doc.heightOfString(text || "-", { width });
            return y + (rowHeight - h) / 2 - 2;
          };

          doc.font("Helvetica").fontSize(9).fillColor(this.pdfColors.text);
          doc.text(String(index), margin + 10, getCenteredY(String(index), 30), { width: 30, align: "left" });

          doc.text(row.name || "-", margin + 45, getCenteredY(row.name, 200), { width: 200, lineBreak: true, align: "left" });
          doc.text(row.chapterName || "-", margin + 250, getCenteredY(row.chapterName, 150), { width: 150, lineBreak: true, align: "left" });
          doc.text(String(row.totalPoints || 0), margin + 410, getCenteredY(String(row.totalPoints || 0), 100), { width: 100, lineBreak: true, align: "left" });
        };

        const drawFooter = (pageNum: number, total: number) => {
          doc.strokeColor(this.pdfColors.navyBlue).lineWidth(1)
            .moveTo(margin, FOOTER_Y)
            .lineTo(pageWidth - margin, FOOTER_Y)
            .stroke();

          doc.strokeColor(this.pdfColors.red).lineWidth(0.5)
            .moveTo(margin, FOOTER_Y + 2)
            .lineTo(pageWidth - margin, FOOTER_Y + 2)
            .stroke();

          doc.fontSize(8).fillColor(this.pdfColors.textLight);
          doc.text(
            `Page ${pageNum} of ${total}`,
            margin,
            FOOTER_Y + 6,
            { width: contentWidth, align: "center" }
          );

          doc.font("Helvetica").fontSize(7).fillColor(this.pdfColors.navyBlue);
          const footerText = "Powered by: Ocean Softwares";
          const textWidth = doc.widthOfString(footerText);
          const startX = pageWidth - margin - textWidth - 2;
          doc.text("Powered by: ", startX, FOOTER_Y + 15, { continued: true })
            .text("Ocean Softwares", { link: "https://www.oceansoftwares.com/", underline: true, lineBreak: false });
        };

        const rows: any[] = data;

        doc.font("Helvetica").fontSize(9);

        const rowHeights = rows.map(row => {
          const h1 = doc.heightOfString(row.name || "-", { width: 200 });
          const h2 = doc.heightOfString(row.chapterName || "-", { width: 150 });
          const h3 = doc.heightOfString(String(row.totalPoints || 0), { width: 100 });
          return Math.max(h1, h2, h3, 20) + 10;
        });

        let totalPages = 1;
        let tempY = HEADER_Y + TABLE_HEADER_HEIGHT;
        for (let i = 0; i < rows.length; i++) {
          if (tempY + rowHeights[i] > FOOTER_Y - 10) {
            totalPages++;
            tempY = HEADER_Y + TABLE_HEADER_HEIGHT;
          }
          tempY += rowHeights[i];
        }

        let pageNum = 1;
        let index = 1;
        let alt = false;
        let y = HEADER_Y;

        drawHeader();
        drawTableHeader(y);
        y += TABLE_HEADER_HEIGHT;

        for (let i = 0; i < rows.length; i++) {
          const rowHeight = rowHeights[i];

          if (y + rowHeight > FOOTER_Y - 10) {
            drawFooter(pageNum, totalPages);
            doc.addPage();
            pageNum++;

            drawHeader();
            y = HEADER_Y;
            drawTableHeader(y);
            y += TABLE_HEADER_HEIGHT;
            alt = false;
          }

          drawRow(y, index++, rows[i], alt, rowHeight);
          alt = !alt;
          y += rowHeight;
        }

        drawFooter(pageNum, totalPages);
        doc.end();
        return res;
      }

      const sortedKeys = [
        "one_to_one",
        "referrals",
        "weekly_meetings",
        "trainings",
        "thank_you_notes",
        "visitors",
        "chief_guests",
        "power_dates",
        "inductions",
        "give",
        "ask",
        "requirement"
      ];

      if (format === "csv") {
        const rows: any[] = [];
        let index = 1;

        for (const item of data) {
          const row: any = {
            "S.No": index++,
            "Member Name": item.name || "-",
            "Chapter": item.chapterName || "-",
            "Total Points": item.totalPoints || 0
          };
          sortedKeys.forEach(key => {
            const label = key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
            row[label] = item.points?.[key] || 0;
          });
          rows.push(row);
        }

        if (rows.length === 0) {
          return res.status(404).json({
            success: false,
            message: "No data found"
          });
        }

        const parser = new Parser();
        const dataCsv = parser.parse(rows);

        const reportLine = `"${generatedAtText}"\n\n`;
        const csv = reportLine + dataCsv;

        res.setHeader("Content-Type", "text/csv");
        res.setHeader(
          "Content-Disposition",
          "attachment; filename=member_points.csv"
        );

        res.send(csv);
        return res;
      }

      if (format === "excel") {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet("Member Points");

        sheet.addRow([generatedAtText]);
        sheet.mergeCells("A1:D1");
        sheet.getRow(1).font = { italic: true };
        sheet.addRow([]);

        const columns = [
          { header: "S.No", key: "sno", width: 8 },
          { header: "Member Name", key: "name", width: 30 },
          { header: "Chapter", key: "chapter", width: 25 },
          { header: "Total Points", key: "totalPoints", width: 15 }
        ];

        sortedKeys.forEach(key => {
          const label = key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
          columns.push({ header: label, key: key, width: 20 });
        });

        sheet.columns = columns;

        let index = 1;

        for (const item of data) {
          const row: any = {
            sno: index++,
            name: item.name || "-",
            chapter: item.chapterName || "-",
            totalPoints: item.totalPoints || 0
          };
          sortedKeys.forEach(key => {
            row[key] = item.points?.[key] || 0;
          });
          sheet.addRow(row);
        }

        res.setHeader(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        res.setHeader(
          "Content-Disposition",
          "attachment; filename=member_points.xlsx"
        );

        await workbook.xlsx.write(res);
        res.end();
        return res;
      }

      return res.status(400).json({
        success: false,
        message: "Invalid format. Use csv | excel | pdf"
      });

    } catch (error) {
      console.error(error);
      if (res.headersSent) return;
      return res.status(500).json({
        success: false,
        message: "Failed to export member points"
      });
    }
  }
  @Get("/thank-you-slips-reports")
  async getThankYouSlipReport(
    @QueryParams() query: any,
    @Res() res: Response
  ) {
    try {

      const page = Number(query.page ?? 0);
      const limit = Number(query.limit ?? 10);
      const search = query.search?.trim();

      const regionId = query.regionId;
      const zoneId = query.zoneId;
      const edId = query.edId;
      const rdId = query.rdId;
      const chapterId = query.chapterId;

      const pipeline: any[] = [

        {
          $match: {
            isDelete: 0,
          }
        },

        {
          $lookup: {
            from: "member",
            let: { giverId: "$createdBy" },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ["$_id", "$$giverId"] }
                }
              },
              {
                $project: {
                  _id: 1,
                  fullName: 1,
                  chapter: 1
                }
              }
            ],
            as: "giver"
          }
        },
        { $unwind: { path: "$giver", preserveNullAndEmptyArrays: true } },

        {
          $lookup: {
            from: "member",
            let: { receiverId: "$thankTo" },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ["$_id", "$$receiverId"] }
                }
              },
              {
                $project: {
                  _id: 1,
                  fullName: 1
                }
              }
            ],
            as: "receiver"
          }
        },
        { $unwind: { path: "$receiver", preserveNullAndEmptyArrays: true } },

        {
          $lookup: {
            from: "chapters",
            let: { chapterId: "$giver.chapter" },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ["$_id", "$$chapterId"] }
                }
              },
              {
                $project: {
                  _id: 1,
                  chapterName: 1,
                  regionId: 1,
                  zoneId: 1,
                  edId: 1,
                  rdId: 1
                }
              }
            ],
            as: "chapter"
          }
        },
        { $unwind: { path: "$chapter", preserveNullAndEmptyArrays: true } },

        ...(chapterId && ObjectId.isValid(chapterId)
          ? [{ $match: { "chapter._id": new ObjectId(chapterId) } }]
          : []),

        ...(regionId && ObjectId.isValid(regionId)
          ? [{ $match: { "chapter.regionId": new ObjectId(regionId) } }]
          : []),

        ...(zoneId && ObjectId.isValid(zoneId)
          ? [{ $match: { "chapter.zoneId": new ObjectId(zoneId) } }]
          : []),

        ...(edId && ObjectId.isValid(edId)
          ? [{ $match: { "chapter.edId": new ObjectId(edId) } }]
          : []),

        ...(rdId && ObjectId.isValid(rdId)
          ? [{ $match: { "chapter.rdId": new ObjectId(rdId) } }]
          : []),

        ...(search
          ? [{
            $match: {
              $or: [
                { "giver.fullName": { $regex: search, $options: "i" } },

                { "receiver.fullName": { $regex: search, $options: "i" } },

                { businessType: { $regex: search, $options: "i" } },

                { referralType: { $regex: search, $options: "i" } },

                {
                  $expr: {
                    $regexMatch: {
                      input: { $toString: "$amount" },
                      regex: search,
                      options: "i"
                    }
                  }
                },

                { comments: { $regex: search, $options: "i" } }
              ]
            }
          }]
          : []),


        { $sort: { createdAt: -1 } },

        {
          $project: {
            _id: 0,
            date: "$createdAt",
            memberName: "$giver.fullName",
            thankTo: "$receiver.fullName",
            businessType: 1,
            referralType: 1,
            amount: 1,
            comments: 1,
            starRating: "$ratings",
            chapterName: "$chapter.chapterName"
          }
        },

        {
          $facet: {
            data: [
              { $skip: page * limit },
              { $limit: limit }
            ],
            meta: [
              { $count: "total" }
            ]
          }
        }
      ];

      const result =
        await AppDataSource
          .getMongoRepository(ThankYouSlip)
          .aggregate(pipeline)
          .toArray();

      const data = result[0]?.data || [];
      const total = result[0]?.meta[0]?.total || 0;

      return pagination(total, data, limit, page, res);

    } catch (error) {
      console.error(error);
      return response(res, 500, "Failed to fetch Thank You Slip report");
    }
  }
  @Get("/thank-you-slips-reports/export")
  async exportThankYouSlipReport(
    @QueryParams() query: any,
    @Res() res: Response
  ): Promise<Response | void> {
    try {
      const { fromDate, toDate, format = "csv" } = query;

      if (!fromDate || !toDate) {
        return res.status(400).json({
          success: false,
          message: "fromDate and toDate are required"
        });
      }

      const start = new Date(`${fromDate}T00:00:00+05:30`);
      const end = new Date(`${toDate}T23:59:59.999+05:30`);
      if (start > end) {
        return res.status(400).json({
          success: false,
          message: "fromDate cannot be greater than toDate"
        });
      }


      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Invalid date format"
        });
      }

      const generatedAtText = `Report Generated at: ${this.formatDateTime(new Date())}`;

      const search = query.search?.trim();

      const regionId = query.regionId;
      const zoneId = query.zoneId;
      const edId = query.edId;
      const rdId = query.rdId;
      const chapterId = query.chapterId;

      const pipeline: any[] = [

        {
          $match: {
            isDelete: 0,
            createdAt: { $gte: start, $lte: end }
          }
        },
        {
          $lookup: {
            from: "member",
            let: { giverId: "$createdBy" },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ["$_id", "$$giverId"] }
                }
              },
              {
                $project: {
                  _id: 1,
                  fullName: 1,
                  chapter: 1
                }
              }
            ],
            as: "giver"
          }
        },
        { $unwind: { path: "$giver", preserveNullAndEmptyArrays: true } },

        {
          $lookup: {
            from: "member",
            let: { receiverId: "$thankTo" },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ["$_id", "$$receiverId"] }
                }
              },
              {
                $project: {
                  _id: 1,
                  fullName: 1
                }
              }
            ],
            as: "receiver"
          }
        },
        { $unwind: { path: "$receiver", preserveNullAndEmptyArrays: true } },

        {
          $lookup: {
            from: "chapters",
            let: { chapterId: "$giver.chapter" },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ["$_id", "$$chapterId"] }
                }
              },
              {
                $project: {
                  _id: 1,
                  chapterName: 1,
                  regionId: 1,
                  zoneId: 1,
                  edId: 1,
                  rdId: 1
                }
              }
            ],
            as: "chapter"
          }
        },
        { $unwind: { path: "$chapter", preserveNullAndEmptyArrays: true } },

        ...(chapterId && ObjectId.isValid(chapterId)
          ? [{ $match: { "chapter._id": new ObjectId(chapterId) } }]
          : []),

        ...(regionId && ObjectId.isValid(regionId)
          ? [{ $match: { "chapter.regionId": new ObjectId(regionId) } }]
          : []),

        ...(zoneId && ObjectId.isValid(zoneId)
          ? [{ $match: { "chapter.zoneId": new ObjectId(zoneId) } }]
          : []),

        ...(edId && ObjectId.isValid(edId)
          ? [{ $match: { "chapter.edId": new ObjectId(edId) } }]
          : []),

        ...(rdId && ObjectId.isValid(rdId)
          ? [{ $match: { "chapter.rdId": new ObjectId(rdId) } }]
          : []),

        ...(search
          ? [{
            $match: {
              $or: [
                { "giver.fullName": { $regex: search, $options: "i" } },

                { "receiver.fullName": { $regex: search, $options: "i" } },

                { businessType: { $regex: search, $options: "i" } },

                { referralType: { $regex: search, $options: "i" } },

                {
                  $expr: {
                    $regexMatch: {
                      input: { $toString: "$amount" },
                      regex: search,
                      options: "i"
                    }
                  }
                },

                { comments: { $regex: search, $options: "i" } }
              ]
            }
          }]
          : []),


        { $sort: { createdAt: -1 } },

        {
          $project: {
            _id: 0,
            date: "$createdAt",
            memberName: "$giver.fullName",
            thankTo: "$receiver.fullName",
            businessType: 1,
            referralType: 1,
            amount: 1,
            comments: 1,
            starRating: "$ratings",
            chapterName: "$chapter.chapterName"
          }
        },

      ];
      const cursor = this.thankYouRepo.aggregate(pipeline);

      if (format === "pdf") {
        const doc = new PDFDocument({ size: "A4", margin: 30 });

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          "attachment; filename=thank_you_slips_report.pdf"
        );

        doc.pipe(res);

        const logoPath = path.resolve(process.cwd(), "uploads", "logo.png");


        const pageWidth = doc.page.width;
        const pageHeight = doc.page.height;
        const margin = 30;
        const contentWidth = pageWidth - margin * 2;

        const HEADER_Y = 120;
        const TABLE_HEADER_HEIGHT = 26;
        const FOOTER_Y = pageHeight - 85;

        const formatLabel = (value?: string) => {
          if (!value) return "-";
          return value
            .toLowerCase()
            .split("_")
            .map(v => v.charAt(0).toUpperCase() + v.slice(1))
            .join(" ");
        };


        const drawHeader = () => {
          if (fs.existsSync(logoPath)) {
            doc.image(logoPath, margin, 35, { width: 65 });
          }

          doc.font("Helvetica-Bold").fontSize(22).fillColor(this.pdfColors.navyBlue);
          doc.text(this.orgName, margin + 80, 42);

          doc.fontSize(14).fillColor(this.pdfColors.red);
          doc.text("Thank You Slip Report", margin + 80, 66);

          const boxX = pageWidth - margin - 185;
          const boxY = 38;

          doc
            .roundedRect(boxX, boxY, 185, 58, 6)
            .fillAndStroke(this.pdfColors.navyLight, this.pdfColors.navyBlue);

          doc.fontSize(10).fillColor(this.pdfColors.navyBlue);
          doc.text("Report Period", boxX + 12, boxY + 10);

          doc.fontSize(9).fillColor(this.pdfColors.text);
          doc.text(`From:  ${this.formatDateOnly(fromDate)}`, boxX + 12, boxY + 26);
          doc.text(`To : ${this.formatDateOnly(toDate)}`, boxX + 12, boxY + 38);

          doc
            .font("Helvetica")
            .fontSize(7)
            .fillColor(this.pdfColors.textLight)
            .text(generatedAtText, margin, 110);

          doc.strokeColor(this.pdfColors.navyBlue).lineWidth(2.5)
            .moveTo(margin, 125)
            .lineTo(pageWidth - margin, 125)
            .stroke();

          doc.strokeColor(this.pdfColors.red).lineWidth(1)
            .moveTo(margin, 128)
            .lineTo(pageWidth - margin, 128)
            .stroke();
        };

        const drawTableHeader = (y: number) => {
          doc.rect(margin, y, contentWidth, TABLE_HEADER_HEIGHT).fill(this.pdfColors.navyBlue);
          doc.rect(margin, y, contentWidth, 2).fill(this.pdfColors.red);

          const columns = [
            { text: "S.No", x: margin + 8, width: 30 },
            { text: "Date", x: margin + 40, width: 80 },
            { text: "Member", x: margin + 125, width: 80 },
            { text: "Amount", x: margin + 210, width: 60 },
            { text: "Thank To", x: margin + 275, width: 95 },
            { text: "Business Type", x: margin + 375, width: 70 },
            { text: "Referral Type", x: margin + 450, width: 100 }
          ];

          doc.font("Helvetica-Bold")
            .fontSize(9)
            .fillColor(this.pdfColors.white);

          columns.forEach(col =>
            doc.text(col.text, col.x, y + 7, { width: col.width, align: "left" })
          );
        };

        /* ---------------- ROW ---------------- */
        const drawRow = (y: number, index: number, row: any, alt: boolean, rowHeight: number) => {
          if (alt) {
            doc.rect(margin, y - 2, contentWidth, rowHeight).fill(this.pdfColors.rowAlt);
          }

          const getCenteredY = (text: string, width: number) => {
            const h = doc.heightOfString(text || "-", { width });
            return y + (rowHeight - h) / 2 - 2;
          };

          doc.font("Helvetica").fontSize(8).fillColor(this.pdfColors.text);
          doc.text(String(index), margin + 10, getCenteredY(String(index), 30), { width: 30, align: "left" });

          doc.font("Helvetica").fontSize(9).fillColor(this.pdfColors.text);

          const slipDate = this.formatDate(row.date);
          doc.text(slipDate, margin + 40, getCenteredY(slipDate, 80), { width: 80, lineBreak: true, align: "left" });

          doc.text(row.memberName || "-", margin + 125, getCenteredY(row.memberName, 80), {
            width: 80,
            lineBreak: true, align: "left"
          });
          doc.text(String(row.amount || "-"), margin + 210, getCenteredY(String(row.amount), 60), {
            width: 60,
            lineBreak: true, align: "left"
          });

          doc.text(row.thankTo || "-", margin + 275, getCenteredY(row.thankTo, 95), {
            width: 95,
            lineBreak: true, align: "left"
          });

          doc.text(formatLabel(row.businessType), margin + 375, getCenteredY(formatLabel(row.businessType), 70), { width: 70, lineBreak: true, align: "left" });

          doc.text(formatLabel(row.referralType), margin + 450, getCenteredY(formatLabel(row.referralType), 100), { width: 100, lineBreak: true, align: "left" });
        };
        const drawFooter = (pageNum: number, total: number) => {
          doc.strokeColor(this.pdfColors.navyBlue).lineWidth(1)
            .moveTo(margin, FOOTER_Y)
            .lineTo(pageWidth - margin, FOOTER_Y)
            .stroke();

          doc.strokeColor(this.pdfColors.red).lineWidth(0.5)
            .moveTo(margin, FOOTER_Y + 2)
            .lineTo(pageWidth - margin, FOOTER_Y + 2)
            .stroke();

          doc.fontSize(8)
            .fillColor(this.pdfColors.textLight)
            .text(`Page ${pageNum} of ${total}`, margin, FOOTER_Y + 8, {
              align: "center"
            });

          doc.font("Helvetica").fontSize(7).fillColor(this.pdfColors.navyBlue);
          const footerText = "Powered by: Ocean Softwares";
          const textWidth = doc.widthOfString(footerText);
          const startX = pageWidth - margin - textWidth - 5;
          doc.text("Powered by: ", startX, FOOTER_Y + 8, { continued: true, lineBreak: false, width: pageWidth - startX - margin })
            .text("Ocean Softwares", { link: "https://www.oceansoftwares.com/", underline: true, lineBreak: false });
        };

        const rows: any[] = [];
        for await (const r of cursor) rows.push(r);

        doc.font("Helvetica").fontSize(9);

        const rowHeights = rows.map(row => {
          const h1 = doc.heightOfString(row.memberName || "-", { width: 80 });
          const h2 = doc.heightOfString(String(row.amount || "-"), { width: 60 });
          const h3 = doc.heightOfString(row.thankTo || "-", { width: 95 });
          const h4 = doc.heightOfString(formatLabel(row.businessType), { width: 70 });
          const h5 = doc.heightOfString(formatLabel(row.referralType), { width: 100 });
          return Math.max(h1, h2, h3, h4, h5, 12) + 8;
        });

        let totalPages = 1;
        let tempY = HEADER_Y + TABLE_HEADER_HEIGHT;
        for (let i = 0; i < rows.length; i++) {
          if (tempY + rowHeights[i] > FOOTER_Y - 10) {
            totalPages++;
            tempY = HEADER_Y + TABLE_HEADER_HEIGHT;
          }
          tempY += rowHeights[i];
        }

        let pageNum = 1;
        let index = 1;
        let alt = false;
        let y = HEADER_Y;

        drawHeader();
        drawTableHeader(y);
        y += TABLE_HEADER_HEIGHT;

        for (let i = 0; i < rows.length; i++) {
          const rowHeight = rowHeights[i];

          if (y + rowHeight > FOOTER_Y - 10) {
            drawFooter(pageNum, totalPages);
            doc.addPage();
            pageNum++;

            drawHeader();
            y = HEADER_Y;
            drawTableHeader(y);
            y += TABLE_HEADER_HEIGHT;
            alt = false;
          }

          drawRow(y, index++, rows[i], alt, rowHeight);
          alt = !alt;
          y += rowHeight;
        }

        drawFooter(pageNum, totalPages);
        doc.end();
        return res;
      }


      if (format === "csv") {
        const rows: any[] = [];
        let index = 1;



        for await (const item of cursor) {
          rows.push({
            "S.No": index++,
            "Date": this.formatDate(item.date),
            "Member Name": item.memberName || "-",
            "Thank To": item.thankTo || "-",
            "Business Type": item.businessType || "-",
            "Referral Type": item.referralType || "-",
            "Amount": item.amount ?? "-",
          });
        }

        if (rows.length === 0) {
          return res.status(404).json({ success: false, message: "No data found" });
        }

        const parser = new Parser();
        const dataCsv = parser.parse(rows);

        const reportLine = `"${generatedAtText}"\n\n`;
        const csv = reportLine + dataCsv;

        res.setHeader("Content-Type", "text/csv");
        res.setHeader(
          "Content-Disposition",
          "attachment; filename=thank_you_slips_report.csv"
        );
        res.send(csv);
        return res;
      }

      /* ===================== EXCEL ===================== */
      if (format === "excel") {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet("Thank You Slips Report");

        sheet.addRow([generatedAtText]);
        sheet.mergeCells("A1:I1");
        sheet.getRow(1).font = { italic: true };
        sheet.addRow([]);

        sheet.columns = [
          { header: "S.No", key: "sno", width: 8 },
          { header: "Date", key: "date", width: 15 },
          { header: "Member Name", key: "memberName", width: 25 },
          { header: "Thank To", key: "thankTo", width: 25 },
          { header: "Business Type", key: "businessType", width: 18 },
          { header: "Referral Type", key: "referralType", width: 18 },
          { header: "Amount", key: "amount", width: 12 },
        ];

        let index = 1;
        for await (const item of cursor) {
          sheet.addRow({
            sno: index++,
            date: this.formatDate(item.date),
            memberName: item.memberName || "-",
            thankTo: item.thankTo || "-",
            businessType: item.businessType || "-",
            referralType: item.referralType || "-",
            amount: item.amount ?? "-",
          });
        }

        res.setHeader(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        res.setHeader(
          "Content-Disposition",
          "attachment; filename=thank_you_slips_report.xlsx"
        );

        await workbook.xlsx.write(res);
        res.end();
        return res;
      }

      return res.status(400).json({
        success: false,
        message: "Invalid format. Use csv | excel | pdf"
      });
    } catch (error) {
      console.error(error);
      if (!res.headersSent) {
        return res.status(500).json({
          success: false,
          message: "Failed to export thank you slips report"
        });
      }
    }
  }

  @Get("/performance-report")
  async getPerformanceReport(
    @QueryParams() query: any,
    @Res() res: Response
  ) {
    try {
      const page = Math.max(Number(query.page) || 0, 0);
      const limit = Math.max(Number(query.limit) || 10, 1);
      const search = query.search?.toString();

      const chapterId = query.chapterId;
      const zoneId = query.zoneId;
      const regionId = query.regionId;
      const edId = query.edId;
      const rdId = query.rdId;

      const formType = query.formType?.toString(); // 121, referal, thankyouslip, visito, traing, meeting, cheif guest, powrDate
      const period = query.period?.toString(); // current_month, tenure_1, tenure_2, one_year, overall

      // --- 1. Date Filter Logic ---
      const now = new Date();
      const currentYear = now.getFullYear();
      let startDate: Date | undefined;
      let endDate: Date | undefined;

      if (period && period !== "overall") {
        if (period === "current_month") {
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        } else if (period === "tenure_1") {
          startDate = new Date(currentYear, 0, 1);
          endDate = new Date(currentYear, 5, 30, 23, 59, 59, 999);
        } else if (period === "tenure_2") {
          startDate = new Date(currentYear, 6, 1);
          endDate = new Date(currentYear, 11, 31, 23, 59, 59, 999);
        } else if (period === "one_year") {
          startDate = new Date(currentYear, 0, 1);
          endDate = new Date(currentYear, 11, 31, 23, 59, 59, 999);
        }
      }

      const pipeline: any[] = [
        { $match: { isDelete: 0 } }, // Active Members

        {
          $lookup: {
            from: "chapters",
            localField: "chapter",
            foreignField: "_id",
            as: "chapterDetails"
          }
        },
        { $unwind: { path: "$chapterDetails", preserveNullAndEmptyArrays: true } },

        {
          $lookup: {
            from: "zones",
            localField: "chapterDetails.zoneId",
            foreignField: "_id",
            as: "zoneDetails"
          }
        },
        { $unwind: { path: "$zoneDetails", preserveNullAndEmptyArrays: true } },

        {
          $lookup: {
            from: "businesscategories",
            localField: "businessCategory",
            foreignField: "_id",
            as: "categoryDetails"
          }
        },
        { $unwind: { path: "$categoryDetails", preserveNullAndEmptyArrays: true } },

        // Hierarchy Filters
        ...(chapterId ? [{ $match: { "chapterDetails._id": new ObjectId(chapterId) } }] : []),
        ...(zoneId ? [{ $match: { "chapterDetails.zoneId": new ObjectId(zoneId) } }] : []),
        ...(regionId ? [{ $match: { "chapterDetails.regionId": new ObjectId(regionId) } }] : []),
        ...(edId ? [{ $match: { "chapterDetails.edId": new ObjectId(edId) } }] : []),
        ...(rdId ? [{ $match: { "chapterDetails.rdId": new ObjectId(rdId) } }] : []),

        // Search Filter
        ...(search ? [{
          $match: {
            $or: [
              { fullName: { $regex: search, $options: "i" } },
              { phoneNumber: { $regex: search, $options: "i" } },
              { "chapterDetails.chapterName": { $regex: search, $options: "i" } }
            ]
          }
        }] : [])
      ];

      let collectionName = "";
      let foreignField = "";
      let dateField = "createdAt";
      let extraMatch: any = { isDelete: 0 };

      const type = formType?.toLowerCase();

      if (type === "one_to_one") {
        collectionName = "one_to_one_meetings";
        foreignField = "initiatedById";
      } else if (type === "referral") {
        collectionName = "referrals";
        foreignField = "fromMemberId";
      } else if (type === "thank_you_slip") {
        collectionName = "thank_you_slips";
        foreignField = "createdBy";
      } else if (type === "visitor") {
        collectionName = "visitors";
        foreignField = "createdBy";
        dateField = "createdAt";
      } else if (type === "meeting") {
        collectionName = "attendance";
        foreignField = "memberId";
        extraMatch = { sourceType: "MEETING", status: "present", isDelete: 0 };
      } else if (type === "training") {
        collectionName = "attendance";
        foreignField = "memberId";
        extraMatch = { sourceType: "TRAINING", status: "present", isDelete: 0 };
      } else if (type === "chief_guest") {
        collectionName = "mobile_chief_guest";
        foreignField = "createdBy";
      } else if (type === "power_date") {
        collectionName = "power_date";
        foreignField = "createdBy";
      }

      if (collectionName) {
        const lookupMatch: any = { ...extraMatch };

        if (startDate && endDate) {
          lookupMatch[dateField] = { $gte: startDate, $lte: endDate };
        }

        lookupMatch["$expr"] = { $eq: ["$" + foreignField, "$$memberId"] };

        pipeline.push({
          $lookup: {
            from: collectionName,
            let: { memberId: "$_id" },
            pipeline: [
              { $match: lookupMatch }
            ],
            as: "activities"
          }
        });

        pipeline.push({
          $addFields: {
            count: { $size: "$activities" }
          }
        });
      } else {
        pipeline.push({ $addFields: { count: 0 } });
      }

      pipeline.push({
        $match: { count: { $gt: 0 } }
      });

      pipeline.push(
        {
          $project: {
            _id: 1,
            name: "$fullName",
            number: "$phoneNumber",
            zone: "$zoneDetails.name",
            chapterName: "$chapterDetails.chapterName",
            category: "$categoryDetails.name",
            count: 1
          }
        },
        { $sort: { count: -1 } }, // Default sort by count descending?
        {
          $facet: {
            data: [
              { $skip: page * limit },
              { $limit: limit }
            ],
            meta: [{ $count: "total" }]
          }
        }
      );

      const result = await this.memberRepo.aggregate(pipeline).toArray();

      const data = result[0]?.data || [];
      const total = result[0]?.meta[0]?.total || 0;

      return pagination(total, data, limit, page, res);

    } catch (error) {
      console.error(error);
      return response(res, 500, "Failed to fetch performance report");
    }
  }

  @Get("/renewal-report")
  async renewalReport(
    @QueryParams() query: any,
    @Res() res: Response
  ) {
    try {

      const page = Math.max(Number(query.page) || 0, 0);
      const limit = Math.max(Number(query.limit) || 10, 1);

      const search = query.search?.toString();
      const statusFilter = query.status;

      const today = new Date();
      const dueSoonDate = new Date();
      dueSoonDate.setDate(today.getDate() + 30);

      const match: any = { isDelete: 0 };

      if (search) {
        match.$or = [
          { fullName: { $regex: search, $options: "i" } },
          { membershipId: { $regex: search, $options: "i" } }
        ];
      }

      const pipeline: any[] = [

        { $match: match },
        {
          $addFields: {
            status: {
              $cond: [
                { $lt: ["$renewalDate", today] },
                "Expired",
                {
                  $cond: [
                    { $lte: ["$renewalDate", dueSoonDate] },
                    "Due Soon",
                    "Active"
                  ]
                }
              ]
            }
          }
        },
        {
          $match: {
            status: statusFilter
              ? statusFilter === "expired"
                ? "Expired"
                : "Due Soon"
              : { $in: ["Expired", "Due Soon"] }
          }
        },
        {
          $lookup: {
            from: "regions",
            let: { regionId: "$region" },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ["$_id", "$$regionId"] }
                }
              },
              {
                $project: {
                  _id: 0,
                  region: 1
                }
              }
            ],
            as: "region"
          }
        },
        { $unwind: { path: "$region", preserveNullAndEmptyArrays: true } },

        {
          $lookup: {
            from: "chapters",
            let: { chapterId: "$chapter" },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ["$_id", "$$chapterId"] }
                }
              },
            ],
            as: "chapter"
          }
        },
        { $unwind: { path: "$chapter", preserveNullAndEmptyArrays: true } },
        ...(query.chapterId && ObjectId.isValid(query.chapterId)
          ? [{ $match: { "chapter._id": new ObjectId(query.chapterId) } }]
          : []),

        ...(query.zoneId && ObjectId.isValid(query.zoneId)
          ? [{ $match: { "chapter.zoneId": new ObjectId(query.zoneId) } }]
          : []),

        ...(query.edId && ObjectId.isValid(query.edId)
          ? [{ $match: { "chapter.edId": new ObjectId(query.edId) } }]
          : []),

        ...(query.rdId && ObjectId.isValid(query.rdId)
          ? [{ $match: { "chapter.rdId": new ObjectId(query.rdId) } }]
          : []),

        {
          $project: {
            memberId: "$membershipId",
            memberName: "$fullName",
            chapter: "$chapter.chapterName",
            region: "$region.region",
            membershipId: "$membershipId",
            status: 1,
            renewalDate: 1
          }
        },

        {
          $facet: {
            data: [
              { $skip: page * limit },
              { $limit: limit }
            ],
            meta: [
              { $count: "total" }
            ]
          }
        }
      ];

      const [result] =
        await this.memberRepo.aggregate(pipeline).toArray();

      const data = result?.data || [];
      const total = result?.meta?.[0]?.total || 0;

      return res.status(200).json({
        success: true,
        total,
        page,
        limit,
        data
      });

    } catch (error) {
      console.error(error);
      return res.status(500).json({
        success: false,
        message: "Server error"
      });
    }
  }

  @Get("/renewal-report/export")
  async exportRenewalReport(
    @QueryParams() query: any,
    @Res() res: Response
  ): Promise<Response | void> {
    try {
      const { fromDate, toDate, format = "csv" } = query;

      if (!fromDate || !toDate) {
        return res.status(400).json({
          success: false,
          message: "fromDate and toDate are required"
        });
      }

      const start = new Date(`${fromDate}T00:00:00+05:30`);
      const end = new Date(`${toDate}T23:59:59.999+05:30`);
      if (start > end) {
        return res.status(400).json({
          success: false,
          message: "fromDate cannot be greater than toDate"
        });
      }


      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Invalid date format"
        });
      }

      const today = new Date();
      const dueSoonDate = new Date();
      dueSoonDate.setDate(today.getDate() + 30);

      const search = query.search?.toString();
      const statusFilter = query.status;
      const match: any = { isDelete: 0, renewalDate: { $gte: start, $lte: end } };

      if (search) {
        match.$or = [
          { fullName: { $regex: search, $options: "i" } },
          { membershipId: { $regex: search, $options: "i" } }
        ];
      }

      const pipeline: any[] = [

        { $match: match },
        {
          $addFields: {
            status: {
              $cond: [
                { $lt: ["$renewalDate", today] },
                "Expired",
                {
                  $cond: [
                    { $lte: ["$renewalDate", dueSoonDate] },
                    "Due Soon",
                    "Active"
                  ]
                }
              ]
            }
          }
        },
        {
          $match: {
            status: statusFilter
              ? statusFilter === "expired"
                ? "Expired"
                : "Due Soon"
              : { $in: ["Expired", "Due Soon"] }
          }
        },
        {
          $lookup: {
            from: "regions",
            let: { regionId: "$region" },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ["$_id", "$$regionId"] }
                }
              },
              {
                $project: {
                  _id: 0,
                  region: 1
                }
              }
            ],
            as: "region"
          }
        },
        { $unwind: { path: "$region", preserveNullAndEmptyArrays: true } },

        {
          $lookup: {
            from: "chapters",
            let: { chapterId: "$chapter" },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ["$_id", "$$chapterId"] }
                }
              },
            ],
            as: "chapter"
          }
        },
        { $unwind: { path: "$chapter", preserveNullAndEmptyArrays: true } },
        ...(query.chapterId && ObjectId.isValid(query.chapterId)
          ? [{ $match: { "chapter._id": new ObjectId(query.chapterId) } }]
          : []),

        ...(query.zoneId && ObjectId.isValid(query.zoneId)
          ? [{ $match: { "chapter.zoneId": new ObjectId(query.zoneId) } }]
          : []),

        ...(query.edId && ObjectId.isValid(query.edId)
          ? [{ $match: { "chapter.edId": new ObjectId(query.edId) } }]
          : []),

        ...(query.rdId && ObjectId.isValid(query.rdId)
          ? [{ $match: { "chapter.rdId": new ObjectId(query.rdId) } }]
          : []),

        {
          $project: {
            memberId: "$membershipId",
            memberName: "$fullName",
            chapterName: "$chapter.chapterName",
            regionName: "$region.region",
            renewalDate: 1,
            status: 1
          }
        },
        { $sort: { renewalDate: 1 } }
      ];


      const data = await this.memberRepo.aggregate(pipeline).toArray();

      if (!data || data.length === 0) {
        return res.status(404).json({
          success: false,
          message: "No data found for the given filters"
        });
      }

      const generatedAtText = `Report Generated at: ${this.formatDateTime(new Date())}`;

      if (format === "pdf") {
        const doc = new PDFDocument({ size: "A4", margin: 30 });
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", "attachment; filename=renewal_report.pdf");
        doc.pipe(res);



        const pageWidth = doc.page.width;
        const pageHeight = doc.page.height;
        const margin = 30;
        const contentWidth = pageWidth - margin * 2;

        const HEADER_Y = 145;
        const TABLE_HEADER_HEIGHT = 38;
        const FOOTER_Y = pageHeight - 85;

        const drawHeader = () => {
          const logoPath = path.resolve(process.cwd(), "uploads", "logo.png");
          if (fs.existsSync(logoPath)) {
            doc.image(logoPath, margin, 35, { width: 65 });
          }

          doc.font("Helvetica-Bold").fontSize(22).fillColor(this.pdfColors.navyBlue);
          doc.text(this.orgName, margin + 80, 42);

          doc.fontSize(14).fillColor(this.pdfColors.red);
          doc.text("Renewal Report", margin + 80, 66);

          const boxX = pageWidth - margin - 185;
          const boxY = 38;

          doc
            .roundedRect(boxX, boxY, 185, 58, 6)
            .fillAndStroke(this.pdfColors.navyLight, this.pdfColors.navyBlue);

          doc.fontSize(10).fillColor(this.pdfColors.navyBlue).font("Helvetica-Bold");
          doc.text("Report Period", boxX + 12, boxY + 10);

          doc.fontSize(9).fillColor(this.pdfColors.text).font("Helvetica");
          doc.text(`From:  ${this.formatDateOnly(fromDate)}`, boxX + 12, boxY + 26);
          doc.text(`To : ${this.formatDateOnly(toDate)}`, boxX + 12, boxY + 38);

          doc.font("Helvetica").fontSize(7).fillColor(this.pdfColors.textLight)
            .text(generatedAtText, margin, 110);

          doc.strokeColor(this.pdfColors.navyBlue).lineWidth(2.5)
            .moveTo(margin, 125)
            .lineTo(pageWidth - margin, 125)
            .stroke();

          doc.strokeColor(this.pdfColors.red).lineWidth(1)
            .moveTo(margin, 128)
            .lineTo(pageWidth - margin, 128)
            .stroke();
        };

        const drawTableHeader = (y: number) => {
          doc.rect(margin, y, contentWidth, 30).fill(this.pdfColors.navyBlue);
          doc.rect(margin, y, contentWidth, 3).fill(this.pdfColors.red);
          doc.font("Helvetica-Bold").fontSize(9).fillColor(this.pdfColors.white);

          const cols = [
            { text: "S.No", x: margin + 10, w: 25 },
            { text: "Member ID", x: margin + 35, w: 65 },
            { text: "Member Name", x: margin + 105, w: 100 },
            { text: "Chapter", x: margin + 210, w: 80 },
            { text: "Region", x: margin + 295, w: 80 },
            { text: "Renewal Date", x: margin + 380, w: 75 },
            { text: "Status", x: margin + 460, w: 75 }
          ];

          cols.forEach(c => doc.text(c.text, c.x, y + 10, { width: c.w, align: "left" }));
        };

        const drawRow = (y: number, index: number, row: any, alt: boolean, rowHeight: number) => {
          if (alt) {
            doc.rect(margin, y, contentWidth, rowHeight).fill(this.pdfColors.rowAlt);
          }

          const getCenteredY = (text: string, width: number) => {
            const h = doc.heightOfString(text || "-", { width });
            return y + (rowHeight - h) / 2 - 2;
          };

          doc.font("Helvetica").fontSize(8).fillColor(this.pdfColors.text);
          doc.text(String(index), margin + 10, getCenteredY(String(index), 20), { width: 20, lineBreak: true, align: "left" });
          doc.text(row.memberId || "-", margin + 35, getCenteredY(row.memberId, 65), { width: 65, lineBreak: true, align: "left" });
          doc.text(row.memberName || "-", margin + 105, getCenteredY(row.memberName, 100), { width: 100, lineBreak: true, align: "left" });
          doc.text(row.chapterName || "-", margin + 210, getCenteredY(row.chapterName, 80), { width: 80, lineBreak: true, align: "left" });
          doc.text(row.regionName || "-", margin + 295, getCenteredY(row.regionName, 80), { width: 80, lineBreak: true, align: "left" });
          const renewalDateText = this.formatDate(row.renewalDate);
          doc.text(renewalDateText, margin + 380, getCenteredY(renewalDateText, 75), { width: 75, lineBreak: true, align: "left" });

          // Status Badge
          const statusColor = row.status === "Expired" ? this.pdfColors.red : (row.status === "Due Soon" ? "#d97706" : "#059669");
          doc.font("Helvetica-Bold").fillColor(statusColor).text(row.status || "-", margin + 460, getCenteredY(row.status, 75), { width: 75, lineBreak: true });
        };

        const drawFooter = (pageNum: number, total: number) => {
          doc.fontSize(8).fillColor(this.pdfColors.textLight);
          doc.text(`Page ${pageNum} of ${total}`, margin, FOOTER_Y + 8, { align: "center" });

          doc.font("Helvetica").fontSize(7).fillColor(this.pdfColors.navyBlue);
          const footerText = "Powered by: Ocean Softwares";
          const textWidth = doc.widthOfString(footerText);
          const startX = pageWidth - margin - textWidth - 5;
          doc.text("Powered by: ", startX, FOOTER_Y + 8, { continued: true, lineBreak: false, width: pageWidth - startX - margin })
            .text("Ocean Softwares", { link: "https://www.oceansoftwares.com/", underline: true, lineBreak: false });
        };

        doc.font("Helvetica").fontSize(8);
        const rowHeights = data.map(item => {
          const h1 = doc.heightOfString(item.memberId || "-", { width: 65 });
          const h2 = doc.heightOfString(item.memberName || "-", { width: 100 });
          const h3 = doc.heightOfString(item.chapterName || "-", { width: 80 });
          const h4 = doc.heightOfString(item.regionName || "-", { width: 80 });
          const h5 = doc.heightOfString(item.status || "-", { width: 75 });
          return Math.max(h1, h2, h3, h4, h5, 12) + 16;
        });

        let totalPages = 1;
        let tempY = HEADER_Y + TABLE_HEADER_HEIGHT;
        for (let i = 0; i < data.length; i++) {
          if (tempY + rowHeights[i] > FOOTER_Y - 10) {
            totalPages++;
            tempY = HEADER_Y + TABLE_HEADER_HEIGHT;
          }
          tempY += rowHeights[i];
        }

        let pageNum = 1;
        let y = HEADER_Y;
        let alt = false;

        drawHeader();
        drawTableHeader(y);
        y += TABLE_HEADER_HEIGHT;

        data.forEach((item, i) => {
          const rowHeight = rowHeights[i];

          if (y + rowHeight > FOOTER_Y - 10) {
            drawFooter(pageNum, totalPages);
            doc.addPage();
            pageNum++;
            drawHeader();
            y = HEADER_Y;
            drawTableHeader(y);
            y += TABLE_HEADER_HEIGHT;
          }
          drawRow(y, i + 1, item, alt, rowHeight);
          y += rowHeight;
          alt = !alt;
        });

        drawFooter(pageNum, totalPages);
        doc.end();
        return res;
      }

      if (format === "excel") {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet("Renewal Report");

        sheet.addRow([generatedAtText]);
        sheet.mergeCells("A1:G1");
        sheet.getRow(1).font = { italic: true };
        sheet.addRow([]);

        sheet.columns = [
          { header: "S.No", key: "sno", width: 10 },
          { header: "Member ID", key: "memberId", width: 15 },
          { header: "Member Name", key: "memberName", width: 25 },
          { header: "Chapter", key: "chapter", width: 20 },
          { header: "Region", key: "region", width: 20 },
          { header: "Renewal Date", key: "renewalDate", width: 15 },
          { header: "Status", key: "status", width: 15 }
        ];

        data.forEach((item, index) => {
          sheet.addRow({
            sno: index + 1,
            memberId: item.memberId,
            memberName: item.memberName,
            chapter: item.chapterName,
            region: item.regionName,
            renewalDate: this.formatDate(item.renewalDate),
            status: item.status
          });
        });

        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", "attachment; filename=renewal_report.xlsx");
        await workbook.xlsx.write(res);
        res.end();
        return res;
      }

      // Default CSV
      const csvRows: any[] = [];

      data.forEach((item, index) => {
        csvRows.push({
          "S.No": index + 1,
          "Member ID": item.memberId || "-",
          "Member Name": item.memberName || "-",
          "Chapter": item.chapterName || "-",
          "Region": item.regionName || "-",
          "Renewal Date": this.formatDate(item.renewalDate),
          "Status": item.status
        });
      });

      const parser = new Parser();
      const csv = parser.parse(csvRows);

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=renewal_report.csv");
      res.status(200).send(csv);
      return res;

    } catch (error) {
      console.error(error);
      return res.status(500).json({
        success: false,
        message: "Failed to export report"
      });
    }
  }
  @Get("/testimonials-report")
  async getTestimonialsReport(
    @QueryParams() query: any,
    @Res() res: Response
  ) {
    try {
      const page = Math.max(Number(query.page) || 0, 0);
      const limit = Number(query.limit ?? 10);

      const search = query.search?.toString();
      const zoneId = query.zoneId;
      const edId = query.edId;
      const rdId = query.rdId;
      const chapterId = query.chapterId;

      const match: any = {
        isDelete: 0,
        ratings: {
          $exists: true,
          $ne: null,
          $gt: 0
        }
      };

      const pipeline: any[] = [

        {
          $match: match
        },
        {
          $lookup: {
            from: "member",
            let: { giverId: "$thankTo" },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ["$_id", "$$giverId"] }
                }
              },
              {
                $project: {
                  _id: 1,
                  fullName: 1,

                  chapter: 1
                }
              }
            ],
            as: "giver"
          }
        },
        { $unwind: { path: "$giver", preserveNullAndEmptyArrays: true } },

        {
          $lookup: {
            from: "member",
            let: { receiverId: "$createdBy" },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ["$_id", "$$receiverId"] }
                }
              },
              {
                $project: {
                  _id: 1,
                  fullName: 1
                }
              }
            ],
            as: "receiver"
          }
        },
        { $unwind: { path: "$receiver", preserveNullAndEmptyArrays: true } },

        {
          $lookup: {
            from: "chapters",
            let: { chapterId: "$giver.chapter" },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ["$_id", "$$chapterId"] }
                }
              },
              {
                $project: {
                  _id: 1,
                  chapterName: 1,
                  regionId: 1,
                  zoneId: 1,
                  edId: 1,
                  rdId: 1
                }
              }
            ],
            as: "chapter"
          }
        },
        { $unwind: { path: "$chapter", preserveNullAndEmptyArrays: true } },

        ...(chapterId && ObjectId.isValid(chapterId)
          ? [{ $match: { "chapter._id": new ObjectId(chapterId) } }]
          : []),


        ...(zoneId && ObjectId.isValid(zoneId)
          ? [{ $match: { "chapter.zoneId": new ObjectId(zoneId) } }]
          : []),

        ...(edId && ObjectId.isValid(edId)
          ? [{ $match: { "chapter.edId": new ObjectId(edId) } }]
          : []),

        ...(rdId && ObjectId.isValid(rdId)
          ? [{ $match: { "chapter.rdId": new ObjectId(rdId) } }]
          : []),

        ...(search
          ? [{
            $match: {
              $or: [
                { "giver.fullName": { $regex: search, $options: "i" } },

                { "receiver.fullName": { $regex: search, $options: "i" } },

                { comments: { $regex: search, $options: "i" } },
              ]
            }
          }]
          : []),


        { $sort: { createdAt: -1 } },

        {
          $project: {
            _id: 0,
            date: "$createdAt",
            memberName: "$giver.fullName",
            testimonialTo: "$receiver.fullName",
            comments: "$comments",
            rating: "$ratings",
            chapterName: "$chapter.chapterName"
          }
        },
        {
          $facet: {
            data: [
              { $skip: page * limit },
              { $limit: limit }
            ],
            meta: [
              { $count: "total" }
            ]
          }
        }

      ];
      const [result] =
        await this.thankYouRepo.aggregate(pipeline).toArray();

      const data = result?.data || [];
      const total = result?.meta?.[0]?.total || 0;

      return response(
        res,
        200,
        "Testimonials report fetched successfully",
        {
          total,
          page,
          limit: limit === 0 ? total : limit,
          data
        }
      );
    } catch (error) {
      console.error(error);
      return response(res, 500, "Failed to fetch testimonials report");
    }
  }

  @Get("/testimonials-report/export")
  async exportTestimonials(
    @QueryParams() query: any,
    @Res() res: Response
  ): Promise<Response | void> {
    try {
      const { fromDate, toDate, format = "csv" } = query;

      if (!fromDate || !toDate) {
        return res.status(400).json({
          success: false,
          message: "fromDate and toDate are required"
        });
      }

      const start = new Date(`${fromDate}T00:00:00+05:30`);
      const end = new Date(`${toDate}T23:59:59.999+05:30`);
      if (start > end) {
        return res.status(400).json({
          success: false,
          message: "fromDate cannot be greater than toDate"
        });
      }


      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Invalid date format"
        });
      }

      const generatedAtText = `Report Generated at: ${this.formatDateTime(new Date())}`;
      const search = query.search?.toString();
      const zoneId = query.zoneId;
      const edId = query.edId;
      const rdId = query.rdId;
      const chapterId = query.chapterId;

      const match: any = {
        isDelete: 0,
        ratings: {
          $exists: true,
          $ne: null,
          $gt: 0
        }
      };

      const pipeline: any[] = [

        {
          $match: match
        },
        {
          $lookup: {
            from: "member",
            let: { giverId: "$thankTo" },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ["$_id", "$$giverId"] }
                }
              },
              {
                $project: {
                  _id: 1,
                  fullName: 1,

                  chapter: 1
                }
              }
            ],
            as: "giver"
          }
        },
        { $unwind: { path: "$giver", preserveNullAndEmptyArrays: true } },

        {
          $lookup: {
            from: "member",
            let: { receiverId: "$createdBy" },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ["$_id", "$$receiverId"] }
                }
              },
              {
                $project: {
                  _id: 1,
                  fullName: 1
                }
              }
            ],
            as: "receiver"
          }
        },
        { $unwind: { path: "$receiver", preserveNullAndEmptyArrays: true } },

        {
          $lookup: {
            from: "chapters",
            let: { chapterId: "$giver.chapter" },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ["$_id", "$$chapterId"] }
                }
              },
              {
                $project: {
                  _id: 1,
                  chapterName: 1,
                  regionId: 1,
                  zoneId: 1,
                  edId: 1,
                  rdId: 1
                }
              }
            ],
            as: "chapter"
          }
        },
        { $unwind: { path: "$chapter", preserveNullAndEmptyArrays: true } },

        ...(chapterId && ObjectId.isValid(chapterId)
          ? [{ $match: { "chapter._id": new ObjectId(chapterId) } }]
          : []),


        ...(zoneId && ObjectId.isValid(zoneId)
          ? [{ $match: { "chapter.zoneId": new ObjectId(zoneId) } }]
          : []),

        ...(edId && ObjectId.isValid(edId)
          ? [{ $match: { "chapter.edId": new ObjectId(edId) } }]
          : []),

        ...(rdId && ObjectId.isValid(rdId)
          ? [{ $match: { "chapter.rdId": new ObjectId(rdId) } }]
          : []),

        ...(search
          ? [{
            $match: {
              $or: [
                { "giver.fullName": { $regex: search, $options: "i" } },

                { "receiver.fullName": { $regex: search, $options: "i" } },

                { comments: { $regex: search, $options: "i" } },
              ]
            }
          }]
          : []),


        { $sort: { createdAt: -1 } },

        {
          $project: {
            _id: 0,
            date: "$createdAt",
            memberName: "$giver.fullName",
            testimonialTo: "$receiver.fullName",
            comments: "$comments",
            rating: "$ratings",
            chapterName: "$chapter.chapterName"
          }
        },
      ];

      const cursor = this.thankYouRepo.aggregate(pipeline);

      if (format === "pdf") {
        const doc = new PDFDocument({ size: "A4", margin: 30 });

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          "attachment; filename=testimonials_report.pdf"
        );

        doc.pipe(res);

        const logoPath = path.resolve(process.cwd(), "uploads", "logo.png");



        const pageWidth = doc.page.width;
        const pageHeight = doc.page.height;
        const margin = 30;
        const contentWidth = pageWidth - margin * 2;

        const HEADER_Y = 145;
        const TABLE_HEADER_HEIGHT = 38;
        const FOOTER_Y = pageHeight - 85;

        const drawHeader = () => {
          if (fs.existsSync(logoPath)) {
            doc.image(logoPath, margin, 35, { width: 65 });
          }

          doc.font("Helvetica-Bold").fontSize(22).fillColor(this.pdfColors.navyBlue);
          doc.text(this.orgName, margin + 80, 42);

          doc.fontSize(14).fillColor(this.pdfColors.red);
          doc.text("Testimonials Report", margin + 80, 66);

          const boxX = pageWidth - margin - 185;
          const boxY = 38;

          doc
            .roundedRect(boxX, boxY, 185, 58, 6)
            .fillAndStroke(this.pdfColors.navyLight, this.pdfColors.navyBlue);

          doc.fontSize(10).fillColor(this.pdfColors.navyBlue);
          doc.text("Report Period", boxX + 12, boxY + 10);

          doc.fontSize(9).fillColor(this.pdfColors.text);
          doc.text(`From:  ${this.formatDateOnly(fromDate)}`, boxX + 12, boxY + 26);
          doc.text(`To : ${this.formatDateOnly(toDate)}`, boxX + 12, boxY + 38);

          doc
            .font("Helvetica")
            .fontSize(7)
            .fillColor(this.pdfColors.textLight)
            .text(generatedAtText, margin, 110);

          doc.strokeColor(this.pdfColors.navyBlue).lineWidth(2.5)
            .moveTo(margin, 125)
            .lineTo(pageWidth - margin, 125)
            .stroke();

          doc.strokeColor(this.pdfColors.red).lineWidth(1)
            .moveTo(margin, 128)
            .lineTo(pageWidth - margin, 128)
            .stroke();
        };

        const drawTableHeader = (y: number) => {
          doc.rect(margin, y, contentWidth, 30).fill(this.pdfColors.navyBlue);
          doc.rect(margin, y, contentWidth, 3).fill(this.pdfColors.red);

          const columns = [
            { text: "S.No", x: margin + 10, width: 30 },
            { text: "Date", x: margin + 45, width: 80 },
            { text: "Member Name", x: margin + 130, width: 100 },
            { text: "Testimonials to", x: margin + 235, width: 100 },
            { text: "Comments", x: margin + 340, width: 100 },
            { text: "Rating", x: margin + 450, width: 40 }
          ];

          doc.font("Helvetica-Bold").fontSize(9).fillColor(this.pdfColors.white);
          columns.forEach(col =>
            doc.text(col.text, col.x, y + 10, { width: col.width, align: "left" })
          );
        };

        const drawRow = (y: number, index: number, row: any, alt: boolean, rowHeight: number) => {
          if (alt) {
            doc.rect(margin, y - 3, contentWidth, rowHeight).fill(this.pdfColors.rowAlt);
          }

          const getCenteredY = (text: string, width: number) => {
            const h = doc.heightOfString(text || "-", { width });
            return y + (rowHeight - h) / 2 - 2;
          };

          doc.font("Helvetica").fontSize(9).fillColor(this.pdfColors.text);
          doc.text(String(index), margin + 10, getCenteredY(String(index), 30), { width: 30, align: "left" });

          const testimonialDate = this.formatDate(row.date);
          doc.text(testimonialDate, margin + 45, getCenteredY(testimonialDate, 80), { width: 80, lineBreak: true, align: "left" });
          doc.text(row.memberName || "-", margin + 130, getCenteredY(row.memberName, 100), { width: 100, lineBreak: true, align: "left" });
          doc.text(row.testimonialTo || "-", margin + 235, getCenteredY(row.testimonialTo, 100), { width: 100, lineBreak: true, align: "left" });

          doc.text(row.comments || "-", margin + 340, getCenteredY(row.comments, 100), { width: 100, lineBreak: true, align: "left" });

          const rating = Number(row.rating || 0);
          const starSpacing = 10;
          const starY = getCenteredY("X", 10) + 4; // Center based on font height, then adjust for path
          let starX = margin + 450;

          const starPath = 'M 0 -4 L 1.1 -1.5 L 3.8 -1.5 L 1.6 0.3 L 2.4 2.8 L 0 1.2 L -2.4 2.8 L -1.6 0.3 L -3.8 -1.5 L -1.1 -1.5 Z';

          for (let i = 1; i <= 5; i++) {
            const cx = starX;
            const cy = starY;

            doc.save();
            doc.translate(cx, cy);
            doc.path(starPath);

            if (i <= rating) {
              doc.fillColor("#f59e0b").fill();
            } else {
              doc.lineWidth(0.5).strokeColor("#f59e0b").stroke();
            }
            doc.restore();

            starX += starSpacing;
          }
        };

        const drawFooter = (pageNum: number, total: number) => {
          doc.strokeColor(this.pdfColors.navyBlue).lineWidth(1)
            .moveTo(margin, FOOTER_Y)
            .lineTo(pageWidth - margin, FOOTER_Y)
            .stroke();

          doc.strokeColor(this.pdfColors.red).lineWidth(0.5)
            .moveTo(margin, FOOTER_Y + 2)
            .lineTo(pageWidth - margin, FOOTER_Y + 2)
            .stroke();

          doc.fontSize(8).fillColor(this.pdfColors.textLight);
          doc.fontSize(8).fillColor(this.pdfColors.textLight);
          doc.text(
            `Page ${pageNum} of ${total}`,
            margin,
            FOOTER_Y + 8,
            { align: "center" }
          );

          doc.font("Helvetica").fontSize(7).fillColor(this.pdfColors.navyBlue);
          const footerText = "Powered by: Ocean Softwares";
          const textWidth = doc.widthOfString(footerText);
          const startX = pageWidth - margin - textWidth - 5;
          doc.text("Powered by: ", startX, FOOTER_Y + 8, { continued: true, lineBreak: false, width: pageWidth - startX - margin })
            .text("Ocean Softwares", { link: "https://www.oceansoftwares.com/", underline: true, lineBreak: false });
        };

        const rows: any[] = [];
        for await (const r of cursor) rows.push(r);

        doc.font("Helvetica").fontSize(9);
        const rowHeights = rows.map(row => {
          const h1 = doc.heightOfString(row.memberName || "-", { width: 100 });
          const h2 = doc.heightOfString(row.testimonialTo || "-", { width: 100 });
          const h3 = doc.heightOfString(row.comments || "-", { width: 100 });
          return Math.max(h1, h2, h3, 20) + 10;
        });

        let totalPages = 1;
        let tempY = HEADER_Y + TABLE_HEADER_HEIGHT;
        for (let i = 0; i < rows.length; i++) {
          if (tempY + rowHeights[i] > FOOTER_Y - 10) {
            totalPages++;
            tempY = HEADER_Y + TABLE_HEADER_HEIGHT;
          }
          tempY += rowHeights[i];
        }

        let pageNum = 1;
        let index = 1;
        let alt = false;
        let y = HEADER_Y;

        drawHeader();
        drawTableHeader(y);
        y += TABLE_HEADER_HEIGHT;

        for (let i = 0; i < rows.length; i++) {
          const rowHeight = rowHeights[i];

          if (y + rowHeight > FOOTER_Y - 10) {
            drawFooter(pageNum, totalPages);
            doc.addPage();
            pageNum++;

            drawHeader();
            y = HEADER_Y;
            drawTableHeader(y);
            y += TABLE_HEADER_HEIGHT;
            alt = false;
          }

          drawRow(y, index++, rows[i], alt, rowHeight);
          alt = !alt;
          y += rowHeight;
        }

        drawFooter(pageNum, totalPages);
        doc.end();
        return res;
      }

      if (format === "csv") {
        const rows: any[] = [];
        let index = 1;



        for await (const item of cursor) {
          rows.push({
            "S.No": index++,
            "Date": this.formatDate(item.date),
            "Member Name": item.memberName,
            "Testimonials to": item.testimonialTo,
            "Comments": item.comments || "-",
            "Star Rating": item.rating || 0
          });
        }

        if (rows.length === 0) {
          return res.status(404).json({
            success: false,
            message: "No data found"
          });
        }

        const parser = new Parser();
        const dataCsv = parser.parse(rows);

        const reportLine = `"${generatedAtText}"\n\n`;
        const csv = reportLine + dataCsv;

        res.setHeader("Content-Type", "text/csv");
        res.setHeader(
          "Content-Disposition",
          "attachment; filename=testimonials_report.csv"
        );

        res.send(csv);
        return res;
      }

      if (format === "excel") {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet("Testimonials");

        sheet.addRow([generatedAtText]);
        sheet.mergeCells("A1:F1");
        sheet.getRow(1).font = { italic: true };
        sheet.addRow([]);

        sheet.columns = [
          { header: "S.No", key: "sno", width: 8 },
          { header: "Date", key: "date", width: 15 },
          { header: "Member Name", key: "memberName", width: 25 },
          { header: "Testimonials to", key: "testimonialTo", width: 25 },
          { header: "Comments", key: "comments", width: 40 },
          { header: "Star Rating", key: "rating", width: 12 }
        ];

        let index = 1;

        for await (const item of cursor) {
          sheet.addRow({
            sno: index++,
            date: this.formatDate(item.date),
            memberName: item.memberName,
            testimonialTo: item.testimonialTo,
            comments: item.comments || "-",
            rating: item.rating || 0
          });
        }

        res.setHeader(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        res.setHeader(
          "Content-Disposition",
          "attachment; filename=testimonials_report.xlsx"
        );

        await workbook.xlsx.write(res);
        res.end();
        return res;
      }

      return res.status(400).json({
        success: false,
        message: "Invalid format. Use csv | excel | pdf"
      });

    } catch (error) {
      console.error(error);
      if (res.headersSent) return;
      return res.status(500).json({
        success: false,
        message: "Failed to export testimonials report"
      });
    }
  }
  @Get("/chief-guest-history/:chiefGuestId")
  async chiefGuestHistory(
    @Param("chiefGuestId") chiefGuestId: string,
    @QueryParams() query: any,
    @Res() res: Response
  ) {
    try {
      if (!ObjectId.isValid(chiefGuestId)) {
        return response(res, 400, "Invalid chiefGuestId");
      }

      const page = Math.max(Number(query.page) || 0, 0);
      const limit = Math.max(Number(query.limit) || 10, 1);
      const search = query.search?.trim();

      const pipeline: any[] = [
        {
          $match: {
            chiefGuestId: new ObjectId(chiefGuestId),
            isDelete: 0
          }
        },

        {
          $lookup: {
            from: "meetings",
            let: { meetingId: "$meetingId" },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ["$_id", "$$meetingId"] }
                }
              },
              {
                $project: {
                  _id: 1,
                  chapters: 1,
                  startDateTime: 1
                }
              }
            ],
            as: "meeting"
          }
        },
        { $unwind: "$meeting" },

        {
          $lookup: {
            from: "chapters",
            let: { chapterIds: "$meeting.chapters" },
            pipeline: [
              {
                $match: {
                  $expr: { $in: ["$_id", "$$chapterIds"] }
                }
              },
              {
                $project: {
                  _id: 1,
                  chapterName: 1
                }
              }
            ],
            as: "chapter"
          }
        },
        { $unwind: "$chapter" },

        {
          $lookup: {
            from: "member",
            let: { invitedById: "$createdBy" },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ["$_id", "$$invitedById"] }
                }
              },
              {
                $project: {
                  _id: 1,
                  fullName: 1
                }
              }
            ],
            as: "invitedBy"
          }
        },
        { $unwind: "$invitedBy" },

        {
          $lookup: {
            from: "attendance",
            let: { meetingId: "$meetingId" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ["$sourceId", "$$meetingId"] },
                      { $eq: ["$sourceType", "MEETING"] },
                      { $eq: ["$isDelete", 0] }
                    ]
                  }
                }
              },
              {
                $project: {
                  _id: 0,
                  status: 1
                }
              }
            ],
            as: "attendance"
          }
        },

        {
          $addFields: {
            meetingStatus: {
              $cond: [
                { $gt: [{ $size: "$attendance" }, 0] },

                {
                  $cond: [
                    {
                      $gt: [
                        {
                          $size: {
                            $filter: {
                              input: "$attendance",
                              as: "a",
                              cond: {
                                $in: ["$$a.status", ["present", "late", "proxy"]]
                              }
                            }
                          }
                        },
                        0
                      ]
                    },
                    "Attended",
                    "Rejected"
                  ]
                },

                "Pending"
              ]
            }
          }
        },
        ...(search
          ? [{
            $match: {
              $or: [
                { "chapter.chapterName": { $regex: search, $options: "i" } },
                { "invitedBy.fullName": { $regex: search, $options: "i" } },
                { meetingStatus: { $regex: search, $options: "i" } }
              ]
            }
          }]
          : []),

        { $sort: { "meeting.startDateTime": -1 } },

        {
          $facet: {
            data: [
              { $skip: page * limit },
              { $limit: limit },
              {
                $project: {
                  _id: 0,
                  chapterName: "$chapter.chapterName",
                  invitedBy: "$invitedBy.fullName",
                  meetingDate: "$meeting.startDateTime",
                  meetingStatus: 1
                }
              }
            ],
            meta: [{ $count: "total" }]
          }
        }
      ];

      const result = await this.meetingChiefGuestRepo
        .aggregate(pipeline)
        .toArray();

      const data = result[0]?.data || [];
      const total = result[0]?.meta[0]?.total || 0;

      return pagination(total, data, limit, page, res);

    } catch (error) {
      console.error(error);
      return response(res, 500, "Failed to fetch chief guest history");
    }
  }

  @Get("/chapter-member-report/export")
  async exportChapterMembers(
    @QueryParams() query: any,
    @Res() res: Response
  ): Promise<Response | void> {
    try {
      const { fromDate, toDate, format = "csv" } = query;
      const chapterId = query.chapterId;
      if (!chapterId || !ObjectId.isValid(chapterId)) {
        return response(
          res,
          StatusCodes.BAD_REQUEST,
          "Invalid or missing Chapter ID"
        );
      }
      if (!fromDate || !toDate) {
        return res.status(400).json({
          success: false,
          message: "fromDate and toDate are required"
        });
      }

      const start = new Date(`${fromDate}T00:00:00+05:30`);
      const end = new Date(`${toDate}T23:59:59.999+05:30`);
      if (start > end) {
        return res.status(400).json({
          success: false,
          message: "fromDate cannot be greater than toDate"
        });
      }


      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Invalid date format"
        });
      }

      const generatedAtText = `Report Generated at: ${this.formatDateTime(new Date())}`;
      const search = query.search?.toString().trim();

      // Fetch chapter name
      const chapterDoc = await this.chapterRepo.findOne({ where: { _id: new ObjectId(chapterId) } as any });
      const chapterName = (chapterDoc as any)?.chapterName || "Unknown Chapter";

      const searchRegex = search ? new RegExp(search, "i") : null;
      const match: any = {
        isDelete: 0,
        chapter: new ObjectId(chapterId),
        createdAt: { $gte: start, $lte: end }
      };
      const pipeline: any[] = [
        { $match: match },
        { $sort: { fullName: 1 } },
        {
          $facet: {
            data: [
              {
                $lookup: {
                  from: "businesscategories",
                  let: { catId: "$businessCategory" },
                  pipeline: [
                    {
                      $match: {
                        $expr: { $eq: ["$_id", "$$catId"] },
                      },
                    },
                    {
                      $project: { _id: 0, name: 1 },
                    },
                  ],
                  as: "category",
                },
              },
              {
                $set: {
                  category: { $ifNull: [{ $first: "$category.name" }, null] },
                },
              },
              ...(searchRegex
                ? [
                  {
                    $match: {
                      fullName: { $regex: searchRegex },
                    },
                  },
                ]
                : []),

              {
                $lookup: {
                  from: "one_to_one_meetings",
                  let: { mId: "$_id" },
                  pipeline: [
                    {
                      $match: {
                        isDelete: 0,
                        $expr: {
                          $or: [
                            { $eq: ["$createdBy", "$$mId"] },
                            { $eq: ["$meetingWithMemberId", "$$mId"] },
                          ],
                        },
                      },
                    },
                    { $count: "count" },
                  ],
                  as: "oneToOne",
                },
              },

              {
                $lookup: {
                  from: "referrals",
                  let: { mId: "$_id" },
                  pipeline: [
                    {
                      $match: {
                        $expr: { $eq: ["$fromMemberId", "$$mId"] },
                        isDelete: 0,
                      },
                    },
                    { $count: "count" },
                  ],
                  as: "referrals",
                },
              },

              {
                $lookup: {
                  from: "visitors",
                  let: { mId: "$_id" },
                  pipeline: [
                    {
                      $match: {
                        $expr: { $eq: ["$createdBy", "$$mId"] },
                        isDelete: 0,
                      },
                    },
                    { $count: "count" },
                  ],
                  as: "visitors",
                },
              },

              {
                $lookup: {
                  from: "mobile_chief_guest",
                  let: { mId: "$_id" },
                  pipeline: [
                    {
                      $match: {
                        $expr: { $eq: ["$createdBy", "$$mId"] },
                        isDelete: 0,
                      },
                    },
                    { $count: "count" },
                  ],
                  as: "chiefGuests",
                },
              },

              {
                $lookup: {
                  from: "thank_you_slips",
                  let: { mId: "$_id" },
                  pipeline: [
                    {
                      $match: {
                        $expr: { $eq: ["$thankTo", "$$mId"] },
                        isDelete: 0,
                      },
                    },
                    {
                      $group: {
                        _id: null,
                        total: { $sum: "$amount" },
                      },
                    },
                  ],
                  as: "thankYouSlips",
                },
              },

              {
                $lookup: {
                  from: "power_date",
                  let: { mId: "$_id" },
                  pipeline: [
                    {
                      $match: {
                        isDelete: 0,
                        $expr: {
                          $or: [
                            { $eq: ["$createdBy", "$$mId"] },
                            { $in: ["$$mId", "$members"] },
                          ],
                        },
                      },
                    },
                    { $count: "count" },
                  ],
                  as: "powerDates",
                },
              },

              {
                $lookup: {
                  from: "attendance",
                  let: { mId: "$_id" },
                  pipeline: [
                    {
                      $match: {
                        $expr: {
                          $and: [
                            { $eq: ["$memberId", "$$mId"] },
                            { $eq: ["$sourceType", "TRAINING"] },
                            { $eq: ["$status", "present"] },
                            { $eq: ["$isDelete", 0] },
                          ],
                        },
                      },
                    },
                    { $count: "count" },
                  ],
                  as: "trainings",
                },
              },
              {
                $set: {
                  oneToOneCount: { $ifNull: [{ $first: "$oneToOne.count" }, 0] },
                  referralCount: { $ifNull: [{ $first: "$referrals.count" }, 0] },
                  visitorCount: { $ifNull: [{ $first: "$visitors.count" }, 0] },
                  chiefGuestCount: { $ifNull: [{ $first: "$chiefGuests.count" }, 0] },
                  thankYouSlipValue: {
                    $ifNull: [{ $first: "$thankYouSlips.total" }, 0],
                  },
                  powerDateCount: { $ifNull: [{ $first: "$powerDates.count" }, 0] },
                  trainingCount: { $ifNull: [{ $first: "$trainings.count" }, 0] },
                },
              },

              {
                $project: {
                  _id: 1,
                  memberName: "$fullName",
                  oneToOneCount: 1,
                  referralCount: 1,
                  visitorCount: 1,
                  chiefGuestCount: 1,
                  thankYouSlipValue: 1,
                  powerDateCount: 1,
                  trainingCount: 1,
                },
              },
            ],
          },
        },
      ];

      const facetResult = await this.memberRepo.aggregate(pipeline).toArray();
      const memberRows = facetResult[0]?.data || [];

      if (format === "pdf") {
        const doc = new PDFDocument({ size: "A4", margin: 30 }); // Portrait

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          "attachment; filename=chapter_member_list.pdf"
        );

        doc.pipe(res);

        const logoPath = path.resolve(process.cwd(), "uploads", "logo.png");


        const pageWidth = doc.page.width;
        const pageHeight = doc.page.height;
        const margin = 30;
        const contentWidth = pageWidth - margin * 2;

        const HEADER_Y = 150;
        const TABLE_HEADER_HEIGHT = 38;
        const FOOTER_Y = pageHeight - 85;

        const drawHeader = () => {
          if (fs.existsSync(logoPath)) {
            doc.image(logoPath, margin, 35, { width: 65 });
          }

          doc.font("Helvetica-Bold").fontSize(22).fillColor(this.pdfColors.navyBlue);
          doc.text(this.orgName, margin + 80, 42);

          doc.fontSize(14).fillColor(this.pdfColors.red);
          doc.text("Chapter Member List Report", margin + 80, 66);

          const boxX = pageWidth - margin - 185;
          const boxY = 38;

          doc
            .roundedRect(boxX, boxY, 185, 58, 6)
            .fillAndStroke(this.pdfColors.navyLight, this.pdfColors.navyBlue);

          doc.fontSize(10).fillColor(this.pdfColors.navyBlue);
          doc.text("Report Period", boxX + 12, boxY + 10);

          doc.fontSize(9).fillColor(this.pdfColors.text);
          doc.text(`From:  ${this.formatDateOnly(fromDate)}`, boxX + 12, boxY + 26);
          doc.text(`To : ${this.formatDateOnly(toDate)}`, boxX + 12, boxY + 38);

          doc
            .font("Helvetica")
            .fontSize(7)
            .fillColor(this.pdfColors.textLight)
            .text(generatedAtText, margin, 105);

          // Chapter name above the table
          doc.font("Helvetica-Bold").fontSize(11).fillColor(this.pdfColors.navyBlue);
          doc.text(`Chapter: ${chapterName}`, margin, 122);

          doc.strokeColor(this.pdfColors.navyBlue).lineWidth(2.5)
            .moveTo(margin, 133)
            .lineTo(pageWidth - margin, 133)
            .stroke();

          doc.strokeColor(this.pdfColors.red).lineWidth(1)
            .moveTo(margin, 136)
            .lineTo(pageWidth - margin, 136)
            .stroke();
        };

        const refinedCols = [
          { text: "S.No", x: margin + 5, width: 30 },
          { text: "Member", x: margin + 35, width: 60 },
          { text: "1-2-1", x: margin + 95, width: 55 },
          { text: "Referral", x: margin + 150, width: 55 },
          { text: "Visitor", x: margin + 205, width: 55 },
          { text: "Chief Guest", x: margin + 260, width: 65 },
          { text: "TYS Value", x: margin + 325, width: 65 },
          { text: "Power Meet", x: margin + 390, width: 50 },
          { text: "Training", x: margin + 450, width: 50 }
        ];

        const drawTableHeader = (y: number) => {
          doc.rect(margin, y, contentWidth, TABLE_HEADER_HEIGHT).fill(this.pdfColors.navyBlue);
          doc.rect(margin, y, contentWidth, 2).fill(this.pdfColors.red);

          doc.font("Helvetica-Bold").fontSize(9).fillColor(this.pdfColors.white);
          refinedCols.forEach(col =>
            doc.text(col.text, col.x, y + 10, { width: col.width, align: "left" })
          );
        };

        const drawRow = (y: number, index: number, row: any, alt: boolean, rowHeight: number) => {
          if (alt) {
            doc.rect(margin, y - 2, contentWidth, rowHeight).fill(this.pdfColors.rowAlt);
          }

          const getCenteredY = (text: string, width: number) => {
            const h = doc.heightOfString(text || "-", { width });
            return y + (rowHeight - h) / 2 - 2;
          };

          doc.font("Helvetica").fontSize(8).fillColor(this.pdfColors.text);
          doc.text(String(index), refinedCols[0].x, getCenteredY(String(index), refinedCols[0].width), { width: refinedCols[0].width, align: "left" });

          doc.font("Helvetica").fontSize(8).fillColor(this.pdfColors.text);

          doc.text(row.memberName || "-", refinedCols[1].x, getCenteredY(row.memberName, refinedCols[1].width), { width: refinedCols[1].width, lineBreak: true, align: "left" });
          doc.text(String(row.oneToOneCount ?? 0), refinedCols[2].x, getCenteredY(String(row.oneToOneCount), refinedCols[2].width), { width: refinedCols[2].width, lineBreak: true, align: "left" });
          doc.text(String(row.referralCount ?? 0), refinedCols[3].x, getCenteredY(String(row.referralCount), refinedCols[3].width), { width: refinedCols[3].width, lineBreak: true, align: "left" });
          doc.text(String(row.visitorCount ?? 0), refinedCols[4].x, getCenteredY(String(row.visitorCount), refinedCols[4].width), { width: refinedCols[4].width, lineBreak: true, align: "left" });
          doc.text(String(row.chiefGuestCount ?? 0), refinedCols[5].x, getCenteredY(String(row.chiefGuestCount), refinedCols[5].width), { width: refinedCols[5].width, lineBreak: true, align: "left" });
          doc.text(String(row.thankYouSlipValue ?? 0), refinedCols[6].x, getCenteredY(String(row.thankYouSlipValue), refinedCols[6].width), { width: refinedCols[6].width, lineBreak: true, align: "left" });
          doc.text(String(row.powerDateCount ?? 0), refinedCols[7].x, getCenteredY(String(row.powerDateCount), refinedCols[7].width), { width: refinedCols[7].width, lineBreak: true, align: "left" });
          doc.text(String(row.trainingCount ?? 0), refinedCols[8].x, getCenteredY(String(row.trainingCount), refinedCols[8].width), { width: refinedCols[8].width, lineBreak: true, align: "left" });
        };

        const drawFooter = (pageNum: number, total: number) => {
          doc.strokeColor(this.pdfColors.navyBlue).lineWidth(1)
            .moveTo(margin, FOOTER_Y)
            .lineTo(pageWidth - margin, FOOTER_Y)
            .stroke();

          doc.strokeColor(this.pdfColors.red).lineWidth(0.5)
            .moveTo(margin, FOOTER_Y + 2)
            .lineTo(pageWidth - margin, FOOTER_Y + 2)
            .stroke();

          doc.fontSize(8).fillColor(this.pdfColors.textLight);
          doc.fontSize(8).fillColor(this.pdfColors.textLight);
          doc.text(
            `Page ${pageNum} of ${total}`,
            margin,
            FOOTER_Y + 8,
            { align: "center" }
          );

          doc.font("Helvetica").fontSize(7).fillColor(this.pdfColors.navyBlue);
          const footerText = "Powered by: Ocean Softwares";
          const textWidth = doc.widthOfString(footerText);
          const startX = pageWidth - margin - textWidth - 5;
          doc.text("Powered by: ", startX, FOOTER_Y + 8, { continued: true, lineBreak: false, width: pageWidth - startX - margin })
            .text("Ocean Softwares", { link: "https://www.oceansoftwares.com/", underline: true, lineBreak: false });
        };

        const rows: any[] = memberRows;

        doc.font("Helvetica").fontSize(8);
        const rowHeights = rows.map(row => {
          const h1 = doc.heightOfString(row.memberName || "-", { width: refinedCols[1].width });
          return Math.max(h1, 12) + 12;
        });

        let totalPages = 1;
        let tempY = HEADER_Y + TABLE_HEADER_HEIGHT;
        for (let i = 0; i < rows.length; i++) {
          if (tempY + rowHeights[i] > FOOTER_Y - 10) {
            totalPages++;
            tempY = HEADER_Y + TABLE_HEADER_HEIGHT;
          }
          tempY += rowHeights[i];
        }

        let pageNum = 1;
        let index = 1;
        let alt = false;
        let y = HEADER_Y;

        drawHeader();
        drawTableHeader(y);
        y += TABLE_HEADER_HEIGHT;

        for (let i = 0; i < rows.length; i++) {
          const rowHeight = rowHeights[i];

          if (y + rowHeight > FOOTER_Y - 10) {
            drawFooter(pageNum, totalPages);
            doc.addPage();
            pageNum++;

            drawHeader();
            y = HEADER_Y;
            drawTableHeader(y);
            y += TABLE_HEADER_HEIGHT;
            alt = false;
          }

          drawRow(y, index++, rows[i], alt, rowHeight);
          alt = !alt;
          y += rowHeight;
        }

        drawFooter(pageNum, totalPages);
        doc.end();
        return res;
      }

      if (format === "csv") {
        const rows: any[] = [];
        let index = 1;



        for (const item of memberRows) {
          rows.push({
            "S.No": index++,
            "Member Name": item.memberName || "-",
            "1-2-1": item.oneToOneCount ?? 0,
            "Referral": item.referralCount ?? 0,
            "Visitor": item.visitorCount ?? 0,
            "Chief Guest": item.chiefGuestCount ?? 0,
            "Thank You Slip Value": item.thankYouSlipValue ?? 0,
            "Power Meet": item.powerDateCount ?? 0,
            "Training": item.trainingCount ?? 0
          });
        }

        if (rows.length === 0) {
          return res.status(404).json({ success: false, message: "No data found" });
        }

        const parser = new Parser();
        const dataCsv = parser.parse(rows);

        const reportLine = `"${generatedAtText}"\n\n`;
        const csv = reportLine + dataCsv;
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", "attachment; filename=chapter_member_report.csv");
        res.send(csv);
        return res;
      }

      if (format === "excel") {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet("Chapter Member Report");

        sheet.addRow([generatedAtText]);
        sheet.mergeCells("A1:I1");
        sheet.getRow(1).font = { italic: true };
        sheet.addRow([`Chapter: ${chapterName}`]);
        sheet.mergeCells("A2:I2");
        sheet.getRow(2).font = { bold: true, size: 12 };
        sheet.addRow([]);

        sheet.columns = [
          { header: "S.No", key: "sno", width: 8 },
          { header: "Member Name", key: "name", width: 25 },
          { header: "1-2-1", key: "oneToOne", width: 10 },
          { header: "Referral", key: "referral", width: 12 },
          { header: "Visitor", key: "visitor", width: 10 },
          { header: "Chief Guest", key: "chiefGuest", width: 14 },
          { header: "Thank You Slip Value", key: "thankYouSlip", width: 22 },
          { header: "Power Meet", key: "powerMeet", width: 14 },
          { header: "Training", key: "training", width: 12 }
        ];

        let index = 1;
        for (const item of memberRows) {
          sheet.addRow({
            sno: index++,
            name: item.memberName || "-",
            oneToOne: item.oneToOneCount ?? 0,
            referral: item.referralCount ?? 0,
            visitor: item.visitorCount ?? 0,
            chiefGuest: item.chiefGuestCount ?? 0,
            thankYouSlip: item.thankYouSlipValue ?? 0,
            powerMeet: item.powerDateCount ?? 0,
            training: item.trainingCount ?? 0
          });
        }

        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", "attachment; filename=chapter_member_report.xlsx");

        await workbook.xlsx.write(res);
        res.end();
        return res;
      }

      return res.status(400).json({ success: false, message: "Invalid format" }); // Should handle query properly

    } catch (error) {
      console.error(error);
      if (res.headersSent) return;
    }
  }

  @Get("/absent-proxy-report/export")
  async exportAbsentandproxy(
    @QueryParams() query: any,
    @Res() res: Response,
    @Req() req: RequestWithUser
  ): Promise<Response | void> {
    try {
      const { fromDate, toDate, format = "csv" } = query;

      if (!fromDate || !toDate) {
        return res.status(400).json({
          success: false,
          message: "fromDate and toDate are required"
        });
      }

      const start = new Date(`${fromDate}T00:00:00+05:30`);
      const end = new Date(`${toDate}T23:59:59.999+05:30`);
      if (start > end) {
        return res.status(400).json({
          success: false,
          message: "fromDate cannot be greater than toDate"
        });
      }


      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Invalid date format"
        });
      }

      const generatedAtText = `Report Generated at: ${this.formatDateTime(new Date())}`;

      const search = req.query.search?.toString();

      const chapterId = req.query.chapterId?.toString();
      const zoneId = req.query.zoneId?.toString();
      const regionId = req.query.regionId?.toString();
      const edId = req.query.edId?.toString();
      const rdId = req.query.rdId?.toString();
      const period = req.query.period?.toString();


      const match: any = {
        isDelete: 0,
        createdAt: { $gte: start, $lte: end }
      };

      if (period && period !== "overall") {
        const now = new Date();
        const currentYear = now.getFullYear();
        let startDate: Date | undefined;
        let endDate: Date | undefined;

        if (period === "current_month") {
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          endDate = new Date(
            now.getFullYear(),
            now.getMonth() + 1,
            0,
            23,
            59,
            59,
            999
          );
        } else if (period === "tenure_1") {
          startDate = new Date(currentYear, 0, 1);
          endDate = new Date(currentYear, 5, 30, 23, 59, 59, 999);
        } else if (period === "tenure_2") {
          startDate = new Date(currentYear, 6, 1);
          endDate = new Date(currentYear, 11, 31, 23, 59, 59, 999);
        } else if (period === "one_year") {
          startDate = new Date(currentYear, 0, 1);
          endDate = new Date(currentYear, 11, 31, 23, 59, 59, 999);
        }

        if (startDate && endDate) {
          match.createdAt = {
            $gte: startDate,
            $lte: endDate,
          };
        }
      }

      const pipeline: any[] = [
        { $match: match },

        {
          $group: {
            _id: "$memberId",
            totalAbsent: {
              $sum: {
                $cond: [{ $eq: ["$status", "absent"] }, 1, 0],
              },
            },
            totalProxy: {
              $sum: {
                $cond: [{ $eq: ["$status", "proxy"] }, 1, 0],
              },
            },
          },
        },

        {
          $lookup: {
            from: "member",
            let: { memberId: "$_id" },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ["$_id", "$$memberId"] },
                },
              },
              {
                $project: {
                  _id: 1,
                  fullName: 1,
                  phoneNumber: 1,
                  businessCategory: 1,
                  chapter: 1,
                },
              },
            ],
            as: "member",
          },
        },
        {
          $unwind: {
            path: "$member",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $lookup: {
            from: "chapters",
            let: { chapterId: "$member.chapter" },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ["$_id", "$$chapterId"] },
                },
              },
              {
                $project: {
                  _id: 1,
                  chapterName: 1,
                  absentLimit: 1,
                  proxyLimit: 1,
                  zoneId: 1,
                  regionId: 1,
                  edId: 1,
                  rdId: 1,
                },
              },
            ],
            as: "chapterDetails",
          },
        },
        {
          $unwind: {
            path: "$chapterDetails",
            preserveNullAndEmptyArrays: true,
          },
        },

        {
          $match: {
            $expr: {
              $or: [
                {
                  $gt: [
                    "$totalAbsent",
                    { $ifNull: ["$chapterDetails.absentLimit", 3] },
                  ],
                },
                {
                  $gt: [
                    "$totalProxy",
                    { $ifNull: ["$chapterDetails.proxyLimit", 3] },
                  ],
                },
              ],
            },
          },
        },

        ...(chapterId
          ? [{ $match: { "chapterDetails._id": new ObjectId(chapterId) } }]
          : []),

        ...(zoneId
          ? [{ $match: { "chapterDetails.zoneId": new ObjectId(zoneId) } }]
          : []),

        ...(regionId
          ? [{ $match: { "chapterDetails.regionId": new ObjectId(regionId) } }]
          : []),

        ...(edId
          ? [{ $match: { "chapterDetails.edId": new ObjectId(edId) } }]
          : []),

        ...(rdId
          ? [{ $match: { "chapterDetails.rdId": new ObjectId(rdId) } }]
          : []),

        {
          $lookup: {
            from: "businesscategories",
            let: { catId: "$member.businessCategory" },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ["$_id", "$$catId"] },
                },
              },
              {
                $project: {
                  _id: 1,
                  name: 1,
                },
              },
            ],
            as: "categoryDetails",
          },
        },
        {
          $unwind: {
            path: "$categoryDetails",
            preserveNullAndEmptyArrays: true,
          },
        },

        ...(search
          ? [
            {
              $match: {
                $or: [
                  { "member.fullName": { $regex: search, $options: "i" } },
                  { "member.phoneNumber": { $regex: search, $options: "i" } },
                  {
                    "chapterDetails.chapterName": {
                      $regex: search,
                      $options: "i",
                    },
                  },
                ],
              },
            },
          ]
          : []),

        {
          $facet: {
            data: [
              { $sort: { totalAbsent: -1 } },
              {
                $project: {
                  _id: 1,
                  name: "$member.fullName",
                  mobileNumber: "$member.phoneNumber",
                  chapterName: "$chapterDetails.chapterName",
                  categoryName: "$categoryDetails.name",
                  totalAbsent: 1,
                  totalProxy: 1,
                  absentLimit: {
                    $ifNull: ["$chapterDetails.absentLimit", 3],
                  },
                  proxyLimit: {
                    $ifNull: ["$chapterDetails.proxyLimit", 3],
                  },
                },
              },
            ],
            meta: [{ $count: "total" }],
          },
        },
      ];


      // Fetch data from facet result
      const result = await this.attendanceRepository.aggregate(pipeline).toArray();
      const dataRows = result[0]?.data || [];

      if (format === "pdf") {
        const doc = new PDFDocument({ size: "A4", margin: 30 }); // Portrait

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          "attachment; filename=absent_proxy_report.pdf"
        );

        doc.pipe(res);

        const logoPath = path.resolve(process.cwd(), "uploads", "logo.png");


        const pageWidth = doc.page.width;
        const pageHeight = doc.page.height;
        const margin = 30;
        const contentWidth = pageWidth - margin * 2;

        const HEADER_Y = 120;
        const TABLE_HEADER_HEIGHT = 28;
        const FOOTER_Y = pageHeight - 85;

        const drawHeader = () => {
          if (fs.existsSync(logoPath)) {
            doc.image(logoPath, margin, 35, { width: 65 });
          }

          doc.font("Helvetica-Bold").fontSize(22).fillColor(this.pdfColors.navyBlue);
          doc.text(this.orgName, margin + 80, 42);

          doc.fontSize(14).fillColor(this.pdfColors.red);
          doc.text("Absent & Proxy Report", margin + 80, 66);

          const boxX = pageWidth - margin - 185;
          const boxY = 38;

          doc
            .roundedRect(boxX, boxY, 185, 58, 6)
            .fillAndStroke(this.pdfColors.navyLight, this.pdfColors.navyBlue);

          doc.fontSize(10).fillColor(this.pdfColors.navyBlue);
          doc.text("Report Period", boxX + 12, boxY + 10);

          doc.fontSize(9).fillColor(this.pdfColors.text);
          doc.text(`From:  ${this.formatDateOnly(fromDate)}`, boxX + 12, boxY + 26);
          doc.text(`To : ${this.formatDateOnly(toDate)}`, boxX + 12, boxY + 38);

          doc
            .font("Helvetica")
            .fontSize(7)
            .fillColor(this.pdfColors.textLight)
            .text(generatedAtText, margin, 110);

          doc.strokeColor(this.pdfColors.navyBlue).lineWidth(2.5)
            .moveTo(margin, 125)
            .lineTo(pageWidth - margin, 125)
            .stroke();

          doc.strokeColor(this.pdfColors.red).lineWidth(1)
            .moveTo(margin, 128)
            .lineTo(pageWidth - margin, 128)
            .stroke();
        };

        const refinedCols = [
          { text: "S.No", x: margin + 5, width: 35 },
          { text: "Name", x: margin + 42, width: 60 },
          { text: "Mobile Number", x: margin + 105, width: 80 },
          { text: "Chapter", x: margin + 190, width: 75 },
          { text: "Category", x: margin + 270, width: 70 },
          { text: "Total Proxy", x: margin + 345, width: 60 },
          { text: "Total Absent", x: margin + 410, width: 75 }
        ];

        const drawTableHeader = (y: number) => {
          doc.rect(margin, y, contentWidth, TABLE_HEADER_HEIGHT).fill(this.pdfColors.navyBlue);
          doc.rect(margin, y, contentWidth, 2).fill(this.pdfColors.red);

          doc.font("Helvetica-Bold").fontSize(9).fillColor(this.pdfColors.white);
          refinedCols.forEach(col =>
            doc.text(col.text, col.x, y + 7, { width: col.width, align: "left" })
          );
        };

        const drawRow = (y: number, index: number, row: any, alt: boolean, rowHeight: number) => {
          if (alt) {
            doc.rect(margin, y - 2, contentWidth, rowHeight).fill(this.pdfColors.rowAlt);
          }

          const getCenteredY = (text: string, width: number) => {
            const h = doc.heightOfString(text || "-", { width });
            return y + (rowHeight - h) / 2 - 2;
          };

          doc.font("Helvetica").fontSize(8).fillColor(this.pdfColors.text);
          doc.text(String(index), margin + 10, getCenteredY(String(index), 20), { width: 20, align: "left" });

          doc.font("Helvetica").fontSize(8).fillColor(this.pdfColors.text);

          doc.text(row.name || "-", refinedCols[1].x, getCenteredY(row.name, refinedCols[1].width), { width: refinedCols[1].width, lineBreak: true, align: "left" });
          doc.text(row.mobileNumber || "-", refinedCols[2].x, getCenteredY(row.mobileNumber, refinedCols[2].width), { width: refinedCols[2].width, lineBreak: true, align: "left" });
          doc.text(row.chapterName || "-", refinedCols[3].x, getCenteredY(row.chapterName, refinedCols[3].width), { width: refinedCols[3].width, lineBreak: true, align: "left" });
          doc.text(row.categoryName || "-", refinedCols[4].x, getCenteredY(row.categoryName, refinedCols[4].width), { width: refinedCols[4].width, lineBreak: true, align: "left" });
          doc.text(String(row.totalProxy || "-"), refinedCols[5].x, getCenteredY(String(row.totalProxy), refinedCols[5].width), { width: refinedCols[5].width, lineBreak: true, align: "left" });
          doc.text(String(row.totalAbsent || "-"), refinedCols[6].x, getCenteredY(String(row.totalAbsent), refinedCols[6].width), { width: refinedCols[6].width, lineBreak: true, align: "left" });
        };

        const drawFooter = (pageNum: number, total: number) => {
          doc.strokeColor(this.pdfColors.navyBlue).lineWidth(1)
            .moveTo(margin, FOOTER_Y)
            .lineTo(pageWidth - margin, FOOTER_Y)
            .stroke();

          doc.strokeColor(this.pdfColors.red).lineWidth(0.5)
            .moveTo(margin, FOOTER_Y + 2)
            .lineTo(pageWidth - margin, FOOTER_Y + 2)
            .stroke();

          doc.fontSize(8).fillColor(this.pdfColors.textLight);
          doc.fontSize(8).fillColor(this.pdfColors.textLight);
          doc.text(
            `Page ${pageNum} of ${total}`,
            margin,
            FOOTER_Y + 8,
            { align: "center" }
          );

          doc.font("Helvetica").fontSize(7).fillColor(this.pdfColors.navyBlue);
          const footerText = "Powered by: Ocean Softwares";
          const textWidth = doc.widthOfString(footerText);
          const startX = pageWidth - margin - textWidth - 5;
          doc.text("Powered by: ", startX, FOOTER_Y + 8, { continued: true, lineBreak: false, width: pageWidth - startX - margin })
            .text("Ocean Softwares", { link: "https://www.oceansoftwares.com/", underline: true, lineBreak: false });
        };

        const rows = dataRows;

        doc.font("Helvetica").fontSize(8);
        const rowHeights = rows.map(row => {
          const h1 = doc.heightOfString(row.name || "-", { width: refinedCols[1].width });
          const h2 = doc.heightOfString(row.mobileNumber || "-", { width: refinedCols[2].width });
          const h3 = doc.heightOfString(row.chapterName || "-", { width: refinedCols[3].width });
          const h4 = doc.heightOfString(row.categoryName || "-", { width: refinedCols[4].width });
          const h5 = doc.heightOfString(String(row.totalProxy || "-"), { width: refinedCols[5].width });
          const h6 = doc.heightOfString(String(row.totalAbsent || "-"), { width: refinedCols[6].width });
          return Math.max(h1, h2, h3, h4, h5, h6, 12) + 12;
        });

        let totalPages = 1;
        let tempY = HEADER_Y + TABLE_HEADER_HEIGHT;
        for (let i = 0; i < rows.length; i++) {
          if (tempY + rowHeights[i] > FOOTER_Y - 10) {
            totalPages++;
            tempY = HEADER_Y + TABLE_HEADER_HEIGHT;
          }
          tempY += rowHeights[i];
        }

        let pageNum = 1;
        let index = 1;
        let alt = false;
        let y = HEADER_Y;

        drawHeader();
        drawTableHeader(y);
        y += TABLE_HEADER_HEIGHT;

        for (let i = 0; i < rows.length; i++) {
          const rowHeight = rowHeights[i];

          if (y + rowHeight > FOOTER_Y - 10) {
            drawFooter(pageNum, totalPages);
            doc.addPage();
            pageNum++;

            drawHeader();
            y = HEADER_Y;
            drawTableHeader(y);
            y += TABLE_HEADER_HEIGHT;
            alt = false;
          }

          drawRow(y, index++, rows[i], alt, rowHeight);
          alt = !alt;
          y += rowHeight;
        }

        drawFooter(pageNum, totalPages);
        doc.end();
        return res;
      }

      if (format === "csv") {
        const rows: any[] = [];
        let index = 1;



        for (const item of dataRows) {
          rows.push({
            "S.No": index++,
            "Name": item.name || "-",
            "Mobile Number": item.mobileNumber || "-",
            "Chapter": item.chapterName || "-",
            "Category": item.categoryName || "-",
            "Total Proxy": item.totalProxy || "-",
            "Total Absent": item.totalAbsent || "-"
          });
        }

        if (rows.length === 0) {
          return res.status(404).json({ success: false, message: "No data found" });
        }

        const parser = new Parser();
        const dataCsv = parser.parse(rows);

        const reportLine = `"${generatedAtText}"\n\n`;
        const csv = reportLine + dataCsv;
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", "attachment; filename=absent_proxy_report.csv");
        res.send(csv);
        return res;
      }

      if (format === "excel") {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet("Member List");

        sheet.addRow([generatedAtText]);
        sheet.mergeCells("A1:J1");
        sheet.getRow(1).font = { italic: true };
        sheet.addRow([]);

        sheet.columns = [
          { header: "S.No", key: "sno", width: 8 },
          { header: "Name", key: "name", width: 25 },
          { header: "Mobile Number", key: "mobileNumber", width: 15 },
          { header: "Chapter", key: "chapter", width: 20 },
          { header: "Category", key: "category", width: 20 },
          { header: "Total Proxy", key: "totalProxy", width: 15 },
          { header: "Total Absent", key: "totalAbsent", width: 15 }
        ];

        let index = 1;
        for (const item of dataRows) {
          sheet.addRow({
            sno: index++,
            name: item.name || "-",
            mobileNumber: item.mobileNumber || "-",
            chapter: item.chapterName || "-",
            category: item.categoryName || "-",
            totalProxy: item.totalProxy || "-",
            totalAbsent: item.totalAbsent || "-"
          });
        }

        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", "attachment; filename=member_list.xlsx");

        await workbook.xlsx.write(res);
        res.end();
        return res;
      }

      return res.status(400).json({ success: false, message: "Invalid format" });

    } catch (error) {
      console.error(error);
      if (res.headersSent) return;
    }
  }


  @Get("/training/:trainingId/attendance-report")
  async getTrainingAttendanceReport(
    @Param("trainingId") trainingId: string,
    @QueryParams() query: any,
    @Res() res: Response
  ) {
    try {
      const page = Number(query.page ?? 0);
      const limit = Number(query.limit ?? 10);
      const skip = page * limit;
      const statusFilter = query.statusFilter || query.status; // All | Present | Absent | Not Updated
      const search = query.search?.toString();

      const trainingObjectId = new ObjectId(trainingId);

      const pipeline: any[] = [
        {
          $match: {
            trainingId: trainingObjectId,
            status: "Approved",
            paymentStatus: "Paid", // ✅ important
            isDelete: 0,
          },
        },

        // 🔹 Join Member
        {
          $lookup: {
            from: "member",
            localField: "memberId",
            foreignField: "_id",
            as: "member",
          },
        },
        { $unwind: "$member" },

        {
          $lookup: {
            from: "chapters",
            let: { chapterId: "$member.chapter" },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ["$_id", "$$chapterId"] }
                }
              },
              {
                $project: {
                  _id: 1,
                  chapterName: 1,
                }
              }
            ],
            as: "chapter"
          }
        },
        { $unwind: { path: "$chapter", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "businesscategories",
            let: { businessCategoryId: "$member.businessCategory" },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ["$_id", "$$businessCategoryId"] }
                }
              },
              {
                $project: {
                  _id: 1,
                  name: 1,
                }
              }
            ],
            as: "category"
          }
        },
        { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "attendance",
            let: { memberId: "$memberId" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ["$memberId", "$$memberId"] },
                      { $eq: ["$sourceId", trainingObjectId] },
                      { $eq: ["$sourceType", "TRAINING"] },
                      { $eq: ["$isDelete", 0] },
                    ],
                  },
                },
              },
            ],
            as: "attendance",
          },
        },
        {
          $addFields: {
            meetingStatus: {
              $cond: [
                { $gt: [{ $size: "$attendance" }, 0] },
                {
                  $cond: [
                    {
                      $eq: [
                        { $arrayElemAt: ["$attendance.status", 0] },
                        "present",
                      ],
                    },
                    "Present",
                    "Absent",
                  ],
                },
                "Not Updated",
              ],
            },
          },
        },
      ];

      if (statusFilter && statusFilter !== "All") {
        pipeline.push({
          $match: { meetingStatus: statusFilter },
        });
      }

      if (search) {
        pipeline.push({
          $match: {
            $or: [
              { "member.fullName": { $regex: search, $options: "i" } },
              { "member.membershipId": { $regex: search, $options: "i" } },
              { "chapter.chapterName": { $regex: search, $options: "i" } }
            ]
          }
        });
      }

      const totalResult = await this.trainingParticipantsRepo.aggregate([
        ...pipeline,
        { $count: "total" },
      ]).toArray();

      const total = totalResult[0]?.total ?? 0;

      pipeline.push(
        { $skip: skip },
        { $limit: limit },
        {
          $project: {
            _id: 0,
            memberId: "$member._id",
            memberCode: "$member.membershipId",
            memberName: "$member.fullName",
            chapterName: "$chapter.chapterName",
            categoryName: "$category.name",
            meetingStatus: 1,
          },
        }
      );

      const data = await this.trainingParticipantsRepo
        .aggregate(pipeline)
        .toArray();

      return res.status(200).json({
        success: true,
        message: "Training attendance report fetched successfully",
        total,
        page,
        limit,
        data,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({
        success: false,
        message: "Internal Server Error",
      });
    }
  }
  @Get("/member/list/export")
  async exportMembers(
    @QueryParams() query: any,
    @Res() res: Response
  ): Promise<Response | void> {
    try {
      const { fromDate, toDate, format = "csv" } = query;

      if (!fromDate || !toDate) {
        return res.status(400).json({
          success: false,
          message: "fromDate and toDate are required"
        });
      }

      const start = new Date(`${fromDate}T00:00:00+05:30`);
      const end = new Date(`${toDate}T23:59:59.999+05:30`);
      if (start > end) {
        return res.status(400).json({
          success: false,
          message: "fromDate cannot be greater than toDate"
        });
      }


      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Invalid date format"
        });
      }

      const generatedAtText = `Report Generated at: ${this.formatDateTime(new Date())}`;

      const match: any = {
        isDelete: 0,
        createdAt: { $gte: start, $lte: end }
      };

      if (query.chapterId && ObjectId.isValid(query.chapterId)) {
        match.chapter = new ObjectId(query.chapterId);
      }
      if (query.zoneId && ObjectId.isValid(query.zoneId)) {
        match.zoneId = new ObjectId(query.zoneId);
      }
      if (query.edId && ObjectId.isValid(query.edId)) {
        match.edId = new ObjectId(query.edId);
      }
      if (query.rdId && ObjectId.isValid(query.rdId)) {
        match.rdId = new ObjectId(query.rdId);
      }

      const pipeline: any[] = [
        { $match: match },
        { $sort: { isActive: -1, createdAt: -1 } },
        {
          $lookup: {
            from: "chapters",
            localField: "chapter",
            foreignField: "_id",
            as: "chapterDetails"
          }
        },
        { $unwind: { path: "$chapterDetails", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "businesscategories",
            localField: "businessCategory",
            foreignField: "_id",
            as: "businessCategoryDetails"
          }
        },
        { $unwind: { path: "$businessCategoryDetails", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "member",
            localField: "referredBy",
            foreignField: "_id",
            as: "referredByDetails"
          }
        },
        { $unwind: { path: "$referredByDetails", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "regions",
            localField: "region",
            foreignField: "_id",
            as: "regionDetails"
          }
        },
        { $unwind: { path: "$regionDetails", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            membershipId: 1,
            fullName: 1,
            phoneNumber: 1,
            email: 1,
            companyName: 1,
            position: 1,
            chapterName: "$chapterDetails.chapterName",
            categoryName: "$businessCategoryDetails.name",
            referredByName: "$referredByDetails.fullName",
            regionName: "$regionDetails.region"
          }
        }
      ];
      const memberRows = await this.memberRepo.aggregate(pipeline).toArray();

      if (memberRows.length === 0 && format !== "pdf") {
        return res.status(404).json({ success: false, message: "No data found" });
      }

      const chapterName = query.chapterId ? memberRows[0]?.chapterName || "All Chapters" : "All Chapters";

      if (format === "pdf") {
        const doc = new PDFDocument({ size: "A4", margin: 30 }); // Portrait

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          "attachment; filename=member_list.pdf"
        );

        doc.pipe(res);

        const logoPath = path.resolve(process.cwd(), "uploads", "logo.png");


        const pageWidth = doc.page.width;
        const pageHeight = doc.page.height;
        const margin = 30;
        const contentWidth = pageWidth - margin * 2;

        const HEADER_Y = 150;
        const TABLE_HEADER_HEIGHT = 38;
        const FOOTER_Y = pageHeight - 85;

        const drawHeader = () => {
          if (fs.existsSync(logoPath)) {
            doc.image(logoPath, margin, 35, { width: 65 });
          }

          doc.font("Helvetica-Bold").fontSize(22).fillColor(this.pdfColors.navyBlue);
          doc.text(this.orgName, margin + 80, 42);

          doc.fontSize(14).fillColor(this.pdfColors.red);
          doc.text("Member List Report", margin + 80, 66);

          const boxX = pageWidth - margin - 185;
          const boxY = 38;

          doc
            .roundedRect(boxX, boxY, 185, 58, 6)
            .fillAndStroke(this.pdfColors.navyLight, this.pdfColors.navyBlue);

          doc.fontSize(10).fillColor(this.pdfColors.navyBlue);
          doc.text("Report Period", boxX + 12, boxY + 10);

          doc.fontSize(9).fillColor(this.pdfColors.text);
          doc.text(`From:  ${this.formatDateOnly(fromDate)}`, boxX + 12, boxY + 26);
          doc.text(`To : ${this.formatDateOnly(toDate)}`, boxX + 12, boxY + 38);

          doc
            .font("Helvetica")
            .fontSize(7)
            .fillColor(this.pdfColors.textLight)
            .text(generatedAtText, margin, 105);

          doc.font("Helvetica-Bold").fontSize(11).fillColor(this.pdfColors.navyBlue);
          doc.text(`Chapter: ${chapterName}`, margin, 122);

          doc.strokeColor(this.pdfColors.navyBlue).lineWidth(2.5)
            .moveTo(margin, 133)
            .lineTo(pageWidth - margin, 133)
            .stroke();

          doc.strokeColor(this.pdfColors.red).lineWidth(1)
            .moveTo(margin, 136)
            .lineTo(pageWidth - margin, 136)
            .stroke();
        };

        const refinedCols = [
          { text: "S.No", x: margin + 5, width: 30 },
          { text: "Mem. ID", x: margin + 35, width: 50 },
          { text: "Member Name", x: margin + 85, width: 100 },
          { text: "Chapter", x: margin + 185, width: 75 },
          { text: "Category", x: margin + 260, width: 75 },
          { text: "Company", x: margin + 335, width: 80 },
          { text: "Position", x: margin + 415, width: 60 },
          { text: "Mobile", x: margin + 475, width: 65 }
        ];

        const drawTableHeader = (y: number) => {
          doc.rect(margin, y, contentWidth, TABLE_HEADER_HEIGHT).fill(this.pdfColors.navyBlue);
          doc.rect(margin, y, contentWidth, 2).fill(this.pdfColors.red);

          doc.font("Helvetica-Bold").fontSize(9).fillColor(this.pdfColors.white);
          refinedCols.forEach(col => {
            const h = doc.heightOfString(col.text, { width: col.width });
            doc.text(col.text, col.x, y + (TABLE_HEADER_HEIGHT - h) / 2, { width: col.width, align: "left" });
          });
        };

        const drawRow = (y: number, index: number, row: any, alt: boolean, rowHeight: number) => {
          if (alt) {
            doc.rect(margin, y - 2, contentWidth, rowHeight).fill(this.pdfColors.rowAlt);
          }

          const getCenteredY = (text: string, width: number) => {
            const h = doc.heightOfString(text || "-", { width });
            return y + (rowHeight - h) / 2;
          };

          doc.font("Helvetica").fontSize(8).fillColor(this.pdfColors.text);
          doc.text(String(index), refinedCols[0].x, getCenteredY(String(index), refinedCols[0].width), { width: refinedCols[0].width, align: "left" });

          doc.text(row.membershipId || "-", refinedCols[1].x, getCenteredY(row.membershipId, refinedCols[1].width), { width: refinedCols[1].width, lineBreak: true, align: "left" });
          doc.text(row.fullName || "-", refinedCols[2].x, getCenteredY(row.fullName, refinedCols[2].width), { width: refinedCols[2].width, lineBreak: true, align: "left" });
          doc.text(row.chapterName || "-", refinedCols[3].x, getCenteredY(row.chapterName, refinedCols[3].width), { width: refinedCols[3].width, lineBreak: true, align: "left" });
          doc.text(row.categoryName || "-", refinedCols[4].x, getCenteredY(row.categoryName, refinedCols[4].width), { width: refinedCols[4].width, lineBreak: true, align: "left" });
          doc.text(row.companyName || "-", refinedCols[5].x, getCenteredY(row.companyName, refinedCols[5].width), { width: refinedCols[5].width, lineBreak: true, align: "left" });
          doc.text(row.position || "-", refinedCols[6].x, getCenteredY(row.position, refinedCols[6].width), { width: refinedCols[6].width, lineBreak: true, align: "left" });
          doc.text(row.phoneNumber || "-", refinedCols[7].x, getCenteredY(row.phoneNumber, refinedCols[7].width), { width: refinedCols[7].width, lineBreak: true, align: "left" });
        };

        const drawFooter = (pageNum: number, total: number) => {
          doc.strokeColor(this.pdfColors.navyBlue).lineWidth(1)
            .moveTo(margin, FOOTER_Y)
            .lineTo(pageWidth - margin, FOOTER_Y)
            .stroke();

          doc.strokeColor(this.pdfColors.red).lineWidth(0.5)
            .moveTo(margin, FOOTER_Y + 2)
            .lineTo(pageWidth - margin, FOOTER_Y + 2)
            .stroke();

          doc.fontSize(8).fillColor(this.pdfColors.textLight);
          doc.fontSize(8).fillColor(this.pdfColors.textLight);
          doc.text(
            `Page ${pageNum} of ${total}`,
            margin,
            FOOTER_Y + 8,
            { align: "center" }
          );

          doc.font("Helvetica").fontSize(7).fillColor(this.pdfColors.navyBlue);
          const footerText = "Powered by: Ocean Softwares";
          const textWidth = doc.widthOfString(footerText);
          const startX = pageWidth - margin - textWidth - 5;
          doc.text("Powered by: ", startX, FOOTER_Y + 8, { continued: true, lineBreak: false, width: pageWidth - startX - margin })
            .text("Ocean Softwares", { link: "https://www.oceansoftwares.com/", underline: true, lineBreak: false });
        };

        const rows: any[] = memberRows;

        doc.font("Helvetica").fontSize(8);
        const rowHeights = rows.map(row => {
          const h1 = doc.heightOfString(row.fullName || "-", { width: refinedCols[2].width });
          const h2 = doc.heightOfString(row.chapterName || "-", { width: refinedCols[3].width });
          const h3 = doc.heightOfString(row.categoryName || "-", { width: refinedCols[4].width });
          const h4 = doc.heightOfString(row.companyName || "-", { width: refinedCols[5].width });
          return Math.max(h1, h2, h3, h4, 12) + 12;
        });

        let totalPages = 1;
        let tempY = HEADER_Y + TABLE_HEADER_HEIGHT;
        for (let i = 0; i < rows.length; i++) {
          if (tempY + rowHeights[i] > FOOTER_Y - 10) {
            totalPages++;
            tempY = HEADER_Y + TABLE_HEADER_HEIGHT;
          }
          tempY += rowHeights[i];
        }

        let pageNum = 1;
        let index = 1;
        let alt = false;
        let y = HEADER_Y;

        drawHeader();
        drawTableHeader(y);
        y += TABLE_HEADER_HEIGHT;

        for (let i = 0; i < rows.length; i++) {
          const rowHeight = rowHeights[i];

          if (y + rowHeight > FOOTER_Y - 10) {
            drawFooter(pageNum, totalPages);
            doc.addPage();
            pageNum++;

            drawHeader();
            y = HEADER_Y;
            drawTableHeader(y);
            y += TABLE_HEADER_HEIGHT;
            alt = false;
          }

          drawRow(y, index++, rows[i], alt, rowHeight);
          alt = !alt;
          y += rowHeight;
        }

        drawFooter(pageNum, totalPages);
        doc.end();
        return res;
      }

      if (format === "csv") {
        const rows: any[] = [];
        let index = 1;



        for (const item of memberRows) {
          rows.push({
            "S.No": index++,
            "Member ID": item.membershipId || "-",
            "Member Name": item.fullName || "-",
            "Chapter": item.chapterName || "-",
            "Category": item.categoryName || "-",
            "Company": item.companyName || "-",
            "Position": item.position || "-",
            "Mobile": item.phoneNumber || "-",
            "Email": item.email || "-"
          });
        }

        if (rows.length === 0) {
          return res.status(404).json({ success: false, message: "No data found" });
        }

        const parser = new Parser();
        const dataCsv = parser.parse(rows);

        const reportLine = `"${generatedAtText}"\n\n`;
        const csv = reportLine + dataCsv;
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", "attachment; filename=chapter_member_report.csv");
        res.send(csv);
        return res;
      }

      if (format === "excel") {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet("Chapter Member Report");

        sheet.addRow([generatedAtText]);
        sheet.mergeCells("A1:I1");
        sheet.getRow(1).font = { italic: true };
        sheet.addRow([`Chapter: ${chapterName}`]);
        sheet.mergeCells("A2:I2");
        sheet.getRow(2).font = { bold: true, size: 12 };
        sheet.addRow([]);

        sheet.columns = [
          { header: "S.No", key: "sno", width: 8, alignment: { horizontal: "left", vertical: "middle" } },
          { header: "Member ID", key: "membershipId", width: 15, alignment: { horizontal: "left", vertical: "middle" } },
          { header: "Member Name", key: "name", width: 25, alignment: { horizontal: "left", vertical: "middle" } },
          { header: "Chapter", key: "chapter", width: 20, alignment: { horizontal: "left", vertical: "middle" } },
          { header: "Category", key: "category", width: 20, alignment: { horizontal: "left", vertical: "middle" } },
          { header: "Company", key: "company", width: 25, alignment: { horizontal: "left", vertical: "middle" } },
          { header: "Position", key: "position", width: 20, alignment: { horizontal: "left", vertical: "middle" } },
          { header: "Mobile", key: "phone", width: 15, alignment: { horizontal: "left", vertical: "middle" } },
          { header: "Email", key: "email", width: 25, alignment: { horizontal: "left", vertical: "middle" } }
        ];

        let index = 1;
        for (const item of memberRows) {
          sheet.addRow({
            sno: index++,
            membershipId: item.membershipId || "-",
            name: item.fullName || "-",
            chapter: item.chapterName || "-",
            category: item.categoryName || "-",
            company: item.companyName || "-",
            position: item.position || "-",
            phone: item.phoneNumber || "-",
            email: item.email || "-"
          });
        }

        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", "attachment; filename=chapter_member_report.xlsx");

        await workbook.xlsx.write(res);
        res.end();
        return res;
      }

      return res.status(400).json({ success: false, message: "Invalid format" }); // Should handle query properly

    } catch (error) {
      console.error(error);
      if (res.headersSent) return;
    }
  }
}
