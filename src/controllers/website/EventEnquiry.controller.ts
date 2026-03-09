import {
    JsonController,
    Post,
    Body,
    Res,
} from "routing-controllers";
import { AppDataSource } from "../../data-source";
import { EventEnquiry } from "../../entity/EventEnquiry";
import { Response } from "express";
import { ObjectId } from "mongodb";

@JsonController("/event-enquiry")
export class WebsiteEventEnquiryController {
    private eventEnquiryRepository = AppDataSource.getMongoRepository(EventEnquiry);

    @Post("/")
    async createEnquiry(@Body() enquiryData: any, @Res() response: Response) {
        try {
            const {
                name,
                email,
                phone,
                message,
                companyName,
                category,
                address,
                invitedBy,
                interestToBecomeMember,
                experienceInMeeting,
                eventId
            } = enquiryData;

            const newEnquiry = this.eventEnquiryRepository.create({
                name,
                email,
                phone,
                message,
                companyName,
                category,
                address,
                invitedBy,
                interestToBecomeMember,
                experienceInMeeting,
                eventId: eventId ? new ObjectId(eventId) : null,
                createdAt: new Date(),
                updatedAt: new Date(),
                isDelete: 0,
            });

            await this.eventEnquiryRepository.save(newEnquiry);
            return response.status(201).json({ message: "Enquiry submitted successfully" });
        } catch (error) {
            console.error(error);
            return response.status(500).json({ message: "Internal server error" });
        }
    }
}
