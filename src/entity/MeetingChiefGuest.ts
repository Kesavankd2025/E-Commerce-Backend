import { Entity, ObjectIdColumn, Column } from "typeorm";
import { ObjectId } from "mongodb";

@Entity()
export class MeetingChiefGuest {
    @ObjectIdColumn()
    _id: ObjectId;

    @Column()
    meetingId: ObjectId;

    @Column()
    chiefGuestId: ObjectId;

    @Column()
    status: string; // e.g. "Assigned"

    @Column({ default: 1 })
    isActive: number;

    @Column({ default: 0 })
    isDelete: number;

    @Column()
    createdBy: ObjectId;

    @Column()
    createdAt: Date;

    @Column()
    updatedBy: ObjectId;

    @Column()
    updatedAt: Date;
}
