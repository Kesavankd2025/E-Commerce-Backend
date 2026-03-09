import {
    Entity,
    ObjectIdColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn
} from "typeorm";
import { ObjectId } from "mongodb";

@Entity("one_to_one_meetings")
export class OneToOneMeeting {
    @ObjectIdColumn()
    _id: ObjectId;

    // 🔹 Who did you meet?
    @Column()
    chapterType: "MY_CHAPTER" | "OTHER_CHAPTER";

    @Column()
    meetingWithMemberId: ObjectId; // selected person
    @Column()
    initiatedById: ObjectId; // selected person
    @Column()
    initiatedBy: "SELF" | "PARTNER";

    // 🔹 Logistics
    @Column()
    meetingDateTime: Date;

    @Column()
    meetingLocation: string;

    // 🔹 Details
    @Column({ nullable: true })
    topicDiscussed?: string;

    @Column("json", { nullable: true })
    photos?: {
        fileName?: string;
        Path?: string;
        originalName?: string;
    }[];

    // image URLs / paths

    // 🔹 Status
    @Column({ default: "COMPLETED" })
    status: "DRAFT" | "COMPLETED";

    // 🔹 Audit
    @Column()
    createdBy: ObjectId;

    @Column()
    updatedBy: ObjectId;

    @Column({ default: 1 })
    isActive: number;

    @Column({ default: 0 })
    isDelete: number;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
