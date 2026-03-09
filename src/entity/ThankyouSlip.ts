import {
    Entity,
    ObjectIdColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn
} from "typeorm";
import { ObjectId } from "mongodb";

@Entity("thank_you_slips")
export class ThankYouSlip {
    @ObjectIdColumn()
    _id: ObjectId;

    // 🔹 Thank to (Receiver name)
    @Column()
    thankTo: ObjectId;

    // 🔹 Type: Inside / Outside
    @Column({ default: "New" })
    businessType: "New" | "Repeat";

    @Column({ default: "Self" })
    referralType: "Outside" | "Self";

    // 🔹 Amount
    @Column()
    amount: number;

    @Column({ nullable: true })
    ratings?: number;

    // 🔹 Comments
    @Column({ nullable: true })
    comments?: string;

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
