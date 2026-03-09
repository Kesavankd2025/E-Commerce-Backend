import {
    Entity,
    ObjectIdColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
} from "typeorm";
import { ObjectId } from "mongodb";

@Entity()
export class MemberEnquiry {
    @ObjectIdColumn()
    id: ObjectId;

    @Column()
    fullName: string;

    @Column()
    email: string;

    @Column()
    phoneNumber: string;

    @Column()
    companyName: string;

    @Column({ nullable: true })
    dateOfBirth: Date;

    @Column({ nullable: true })
    position: string;

    @Column({ nullable: true })
    businessCategory: string;

    @Column({ nullable: true })
    referredBy: string;

    @Column({ nullable: true })
    anniversary: Date;

    @Column("simple-json", { nullable: true })
    address: {
        doorNo: string;
        street: string;
        area: string;
        city: string;
        state: string;
        pincode: string;
    };

    @Column({ default: false })
    isWantSmsEmailUpdates: boolean;

    @Column({ default: 0 })
    isDelete: number;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
