import {
    Entity,
    ObjectIdColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    Index,
} from "typeorm";
import { ObjectId } from "mongodb";
@Entity()
@Index("idx_chapter_active_not_deleted", ["chapter", "isActive", "isDelete"])
export class Member {

    @ObjectIdColumn()
    id: ObjectId;

    @Column("simple-json", { nullable: true })
    profileImage?: {
        fileName?: string;
        path?: string;
        originalName?: string;
    };


    @Column()
    fullName: string;

    @Column()
    phoneNumber: string;

    @Column()
    whatsappNumber: string;

    @Column()
    roleId: ObjectId

    @Column()
    email: string;

    @Column()
    companyName: string;

    @Column()
    membershipId: string;

    @Column({ nullable: true })
    region: ObjectId;

    @Column()
    chapter: ObjectId;

    @Column()
    position: string;

    @Column({ nullable: true })
    businessCategory: ObjectId;

    @Column({ nullable: true })
    referredBy: ObjectId;

    @Column({ nullable: true })
    dateOfBirth?: Date;

    @Column()
    anniversary: Date;

    @Column()
    officeAddress: {
        doorNo: string;
        oldNo: string;
        street: string;
        area: string;
        city: string;
        state: string;
        pincode: string;
    };

    @Column({ default: false })
    isWantSmsEmailUpdates: boolean;

    // SUBSCRIPTION DETAILS
    @Column()
    annualFee: number;

    @Column()
    paymentMode: string;

    @Column()
    transactionId: string;

    @Column()
    paymentDate: Date;

    @Column()
    joiningDate: Date;

    @Column()
    renewalDate: Date;

    @Column()
    gstNumber: string;

    @Column({ default: false })
    sendWelcomeSms: boolean;

    // TRAINING REPORT
    @Column()
    trainingYear: string;

    @Column()
    trainingTypes: string[];

    @Column("simple-json", { nullable: true })
    trainings: {
        year: string;
        type: string;
    }[];

    @Column("simple-json", { nullable: true })
    awards: {
        tenure: Date;
        award: ObjectId;
    }[];

    @Column()
    clubMemberType: string;

    // SYSTEM FIELDS
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

    @Column()
    updatedBy: ObjectId;

    @Column({ nullable: true })
    about: string;

    @Column({ nullable: true })
    websiteUrl: string;

    @Column({ nullable: true })
    instagramUrl: string;

    @Column({ nullable: true })
    linkedinUrl: string;

    @Column({ nullable: true })
    facebookUrl: string;

    @Column({ nullable: true })
    twitterUrl: string;

    @Column({ nullable: true })
    panCard: string;

    @Column({ nullable: true })
    bloodGroup: string;

    @Column({ nullable: true })
    country: string;

    @Column()
    badgeIds: ObjectId[];

    @Column()
    pin: string;

    @Column({ nullable: true })
    deviceToken: string;
}
