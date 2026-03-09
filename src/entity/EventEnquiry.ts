import {
    Entity,
    ObjectIdColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
} from "typeorm";
import { ObjectId } from "mongodb";

@Entity()
export class EventEnquiry {
    @ObjectIdColumn()
    id: ObjectId;

    @Column()
    eventId: ObjectId;

    @Column()
    name: string;

    @Column()
    email: string;

    @Column()
    phone: string;

    @Column({ nullable: true })
    message: string;

    @Column({ nullable: true })
    companyName: string;

    @Column({ nullable: true })
    category: string;

    @Column({ nullable: true })
    address: string;

    @Column({ nullable: true })
    invitedBy: string;

    @Column({ nullable: true })
    interestToBecomeMember: string;

    // "Fair" | "Good" | "Excellent"
    @Column({ nullable: true })
    experienceInMeeting: string;

    @Column({ default: 0 })
    isDelete: number;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
