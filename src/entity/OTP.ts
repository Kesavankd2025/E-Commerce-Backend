import { Entity, ObjectIdColumn, Column, CreateDateColumn, UpdateDateColumn } from "typeorm";
import { ObjectId } from "mongodb";

@Entity()
export class OTP {
    @ObjectIdColumn()
    id: ObjectId;

    @Column()
    phoneNumber: string;

    @Column()
    otp: string;

    @Column()
    expiresAt: Date;

    @Column({ default: false })
    isVerified: boolean;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
