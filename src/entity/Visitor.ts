import {
    Entity,
    ObjectIdColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn
} from "typeorm";
import { ObjectId } from "mongodb";

@Entity("visitors")
export class Visitor {
    @ObjectIdColumn()
    _id: ObjectId;

    @Column("simple-json", { nullable: true })
    profileImage?: {
        fileName?: string;
        path?: string;
        originalName?: string;
    };
    // 🔹 Visitor details
    @Column()
    visitorName: string;

    @Column()
    contactNumber: string;
    @Column()
    status: string;
    // 🔹 Business category (lookup)
    @Column()
    businessCategory: string;

    // 🔹 Source of event
    @Column()
    companyName: string;

    @Column()
    email: string;

    @Column()
    address: string;

    @Column()
    about: string;

    @Column()
    createdBy: ObjectId;
    // 🔹 Audit
    @Column()
    chapterId: ObjectId;

    @Column()
    sourceType: string;

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
