import {
    JsonController,
    Get,
    Res,
    Req,
    UseBefore,
    QueryParams,
} from "routing-controllers";
import { AppDataSource } from "../../data-source";
import { MemberEnquiry } from "../../entity/MemberEnquiry";
import { Response, Request } from "express";
import { AuthMiddleware } from "../../middlewares/AuthMiddleware";
import { handleErrorResponse, pagination } from "../../utils";
import { Parser } from "json2csv";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import path from "path";
import fs from "fs";

@JsonController("/member-enquiry")
@UseBefore(AuthMiddleware)
export class AdminMemberEnquiryController {
    private memberEnquiryRepository = AppDataSource.getMongoRepository(MemberEnquiry);

    @Get("/")
    async getAllEnquiries(@Req() req: Request, @Res() response: Response) {
        try {
            const page = Number(req.query.page ?? 0);
            const limit = Number(req.query.limit ?? 10);
            const search = req.query.search?.toString();

            const match: any = { isDelete: 0 };

            if (search) {
                match.$or = [
                    { fullName: { $regex: search, $options: "i" } },
                    { email: { $regex: search, $options: "i" } },
                    { phoneNumber: { $regex: search, $options: "i" } },
                    { companyName: { $regex: search, $options: "i" } }
                ];
            }

            const pipeline: any[] = [
                { $match: match },
                { $sort: { createdAt: -1 } },
                {
                    $facet: {
                        data: [
                            ...(limit > 0
                                ? [{ $skip: page * limit }, { $limit: limit }]
                                : [])
                        ],
                        meta: [{ $count: "total" }]
                    }
                }
            ];

            const result = await this.memberEnquiryRepository.aggregate(pipeline).toArray();

            const data = result[0]?.data ?? [];
            const total = result[0]?.meta[0]?.total ?? 0;

            return pagination(total, data, limit, page, response);
        } catch (error) {
            return handleErrorResponse(error, response);
        }
    }

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

    @Get("/export")
    async exportEnquiries(@QueryParams() query: any, @Res() res: Response): Promise<Response | void> {
        try {
            const { fromDate, toDate, format = "csv" } = query;

            if (!fromDate || !toDate) {
                return res.status(400).json({ success: false, message: "fromDate and toDate are required" });
            }

            const start = new Date(`${fromDate}T00:00:00+05:30`);
            const end = new Date(`${toDate}T23:59:59.999+05:30`);

            if (start > end) {
                return res.status(400).json({ success: false, message: "fromDate cannot be greater than toDate" });
            }

            const match: any = {
                isDelete: 0,
                createdAt: { $gte: start, $lte: end }
            };

            const pipeline: any[] = [
                { $match: match },
                { $sort: { createdAt: -1 } }
            ];

            const cursor = this.memberEnquiryRepository.aggregate(pipeline);
            const generatedAtText = `Generated on: ${this.formatDateTime(new Date())}`;

            if (format === "pdf") {
                const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 50 });
                res.setHeader("Content-Type", "application/pdf");
                res.setHeader("Content-Disposition", "attachment; filename=member_enquiries.pdf");
                doc.pipe(res);

                doc.fontSize(20).text("Member Enquiries Report", { align: "center" });
                doc.fontSize(12).text(`Period: ${this.formatDateOnly(fromDate)} to ${this.formatDateOnly(toDate)}`, { align: "center" });
                doc.moveDown();

                const rows: any[] = [];
                for await (const r of cursor) rows.push(r);

                rows.forEach((row, idx) => {
                    doc.fontSize(10).text(`${idx + 1}. ${row.fullName || "-"} | ${row.email || "-"} | ${row.phoneNumber || "-"} | ${row.companyName || "-"} | ${row.date ? new Date(row.date).toLocaleDateString() : "-"}`);
                    doc.moveDown(0.5);
                });

                doc.end();
                return res;
            }

            if (format === "csv") {
                const rows: any[] = [];
                let index = 1;

                rows.push({
                    "S.No": "",
                    "Full Name": "",
                    "Email": "",
                    "Phone Number": "",
                    "Company Name": "",
                    "Message": ""
                });

                for await (const item of cursor) {
                    rows.push({
                        "S.No": index++,
                        "Full Name": item.fullName || "-",
                        "Email": item.email || "-",
                        "Phone Number": item.phoneNumber || "-",
                        "Company Name": item.companyName || "-",
                        "Message": item.message || "-"
                    });
                }

                if (rows.length === 1) {
                    return res.status(404).json({ success: false, message: "No data found" });
                }

                const parser = new Parser();
                const csv = parser.parse(rows);
                res.setHeader("Content-Type", "text/csv");
                res.setHeader("Content-Disposition", "attachment; filename=member_enquiries.csv");
                res.send(csv);
                return res;
            }

            if (format === "excel") {
                const workbook = new ExcelJS.Workbook();
                const sheet = workbook.addWorksheet("Member Enquiries");

                sheet.addRow([generatedAtText]);
                sheet.mergeCells("A1:G1");
                sheet.getRow(1).font = { italic: true };
                sheet.addRow([]);

                sheet.columns = [
                    { header: "S.No", key: "sno", width: 8 },
                    { header: "Full Name", key: "fullName", width: 25 },
                    { header: "Email", key: "email", width: 30 },
                    { header: "Phone Number", key: "phoneNumber", width: 20 },
                    { header: "Company Name", key: "companyName", width: 25 },
                    { header: "Message", key: "message", width: 40 },
                    { header: "Date", key: "date", width: 20 }
                ];

                let index = 1;
                for await (const item of cursor) {
                    sheet.addRow({
                        sno: index++,
                        fullName: item.fullName || "-",
                        email: item.email || "-",
                        phoneNumber: item.phoneNumber || "-",
                        companyName: item.companyName || "-",
                        message: item.message || "-",
                        date: item.date ? new Date(item.date).toLocaleDateString() : "-"
                    });
                }

                res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
                res.setHeader("Content-Disposition", "attachment; filename=member_enquiries.xlsx");

                await workbook.xlsx.write(res);
                res.end();
                return res;
            }

            return res.status(400).json({ success: false, message: "Invalid format. Use csv | excel | pdf" });
        } catch (error) {
            console.error(error);
            if (res.headersSent) return;
            return res.status(500).json({ success: false, message: "Failed to export member enquiries" });
        }
    }
}
