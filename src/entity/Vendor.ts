import { Entity, ObjectIdColumn, Column, CreateDateColumn, UpdateDateColumn } from "typeorm";
import { ObjectId } from "mongodb";

@Entity("vendors")
export class Vendor {
    @ObjectIdColumn()
    id: ObjectId;

    @Column({ nullable: true })
    name: string;

    @Column({ nullable: true })
    contactPerson: string;

    @Column({ nullable: true })
    phoneNumber: string;

    @Column({ nullable: true })
    address: string;

    @Column({ nullable: true })
    gstNumber: string;

    @Column({ nullable: true })
    bankName: string;

    @Column({ nullable: true })
    accountNumber: string;

    @Column({ nullable: true })
    ifscCode: string;

    @Column({ default: true })
    status: boolean;

    @Column({ default: 0 })
    isDelete: number;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @Column({ nullable: true })
    createdBy?: ObjectId;

    @Column({ nullable: true })
    updatedBy?: ObjectId;
}
