import {
    JsonController,
    Get,
    Req,
    Post,
    Body,
    Param,
    Put,
    Delete,
    Res,
    UseBefore,
} from "routing-controllers";
import { AppDataSource } from "../../data-source";
import { Event } from "../../entity/Event";
import { EventEnquiry } from "../../entity/EventEnquiry";
import { ObjectId } from "mongodb";
import { Request, Response } from "express";
import { handleErrorResponse, pagination } from "../../utils";
import { AuthMiddleware } from "../../middlewares/AuthMiddleware";

@JsonController("/event")
@UseBefore(AuthMiddleware)
export class EventController {
    private eventRepository = AppDataSource.getMongoRepository(Event);
    private eventEnquiryRepository = AppDataSource.getMongoRepository(EventEnquiry);

    @Get("/")
    async getAllEvents(@Req() req: Request, @Res() response: Response) {
        try {
            const page = Number(req.query.page ?? 0);
            const limit = Number(req.query.limit ?? 10);
            const search = req.query.search?.toString();

            const match: any = { isDelete: 0 };

            if (search) {
                match.$or = [
                    { title: { $regex: search, $options: "i" } },
                    { venue: { $regex: search, $options: "i" } }
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

            const result = await this.eventRepository.aggregate(pipeline).toArray();

            const data = result[0]?.data ?? [];
            const total = result[0]?.meta[0]?.total ?? 0;

            return pagination(total, data, limit, page, response);
        } catch (error) {
            return handleErrorResponse(error, response);
        }
    }

    @Get("/:id")
    async getEventById(@Param("id") id: string, @Res() response: Response) {
        const event = await this.eventRepository.findOneBy({
            _id: new ObjectId(id),
        });
        console.log(event, "event");
        console.log(id, "id");


        if (!event) {
            return response.status(404).json({ message: "Event not found" });
        }

        // Get enquiries for this event
        const enquiries = await this.eventEnquiryRepository.find({
            where: { eventId: new ObjectId(id), isDelete: 0 },
            order: { createdAt: -1 }
        });
        console.log(enquiries, "enquiries");

        return response.status(200).json({ ...event, enquiries });
    }

    @Post("/")
    async createEvent(@Body() eventData: Event, @Res() response: Response) {
        const newEvent = this.eventRepository.create({
            ...eventData,
            createdAt: new Date(),
            updatedAt: new Date(),
            isActive: 1,
            isDelete: 0,
        });

        await this.eventRepository.save(newEvent);
        return response.status(201).json({ message: "Event created successfully" });
    }

    @Put("/:id")
    async updateEvent(
        @Param("id") id: string,
        @Body() eventData: Event,
        @Res() response: Response
    ) {
        const event = await this.eventRepository.findOneBy({
            _id: new ObjectId(id),
        });

        if (!event) {
            return response.status(404).json({ message: "Event not found" });
        }

        await this.eventRepository.update(
            { id: new ObjectId(id) },
            { ...eventData, updatedAt: new Date() }
        );

        return response.status(200).json({ message: "Event updated successfully" });
    }

    @Delete("/:id")
    async deleteEvent(@Param("id") id: string, @Res() response: Response) {
        // Soft delete
        await this.eventRepository.update(
            { id: new ObjectId(id) },
            { isDelete: 1, updatedAt: new Date() }
        );
        return response.status(200).json({ message: "Event deleted successfully" });
    }
}
