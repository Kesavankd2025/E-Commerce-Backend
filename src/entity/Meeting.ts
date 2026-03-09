import { ObjectId } from "mongodb";
import {
    Entity,
    Column,
    ObjectIdColumn,
    CreateDateColumn,
    UpdateDateColumn
} from "typeorm";

@Entity("meetings")
export class Meeting {

    @ObjectIdColumn()
    _id: ObjectId;

    @Column()
    meetingTopic: string;

    @Column("double")
    meetingFee: number;

    @Column("double")
    visitorFee: number;

    @Column()
    hotelName: string;

    @Column()
    chapters: ObjectId[];

    @Column()
    startDateTime: Date;

    @Column()
    endDateTime: Date;

    @Column()
    latePunchTime: Date;

    @Column()
    location: {
        name: string;
        latitude: number;
        longitude: number;
    };

    @Column({ default: 1 })
    isActive: number;

    @Column({ default: 0 })
    isDelete: number;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @Column()
    createdBy: ObjectId;

    @Column({ nullable: true })
    updatedBy?: ObjectId;

    @Column("simple-json", { nullable: true })
    qrImage?: {
        fileName?: string;
        Path?: string;
        originalName?: string;
    };
}
