import { Entity, ObjectIdColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from "typeorm";
import { ObjectId } from "mongodb";

@Entity("customers")
export class Customer {
    @ObjectIdColumn()
    id: ObjectId;

    @Column()
    fullName: string;

    @Column()
    @Index({ unique: true })
    phoneNumber: string;

    @Column({ nullable: true })
    email: string;

    @Column({ nullable: true })
    address: string;

    @Column()
    password: string;

    @Column({ default: true })
    isActive: boolean;

    @Column({ default: 0 })
    isDelete: number;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @Column({ nullable: true })
    lastLogin: Date;
}
