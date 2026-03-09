import { ObjectId } from 'mongodb';
import {
    Entity,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    ObjectIdColumn
} from 'typeorm';

@Entity('chief_guests')
export class ChiefGuest {
    @ObjectIdColumn()
    _id: string;

    @Column("simple-json", { nullable: true })
    profileImage?: {
        fileName?: string;
        path?: string;
        originalName?: string;
    };

    @Column()
    chiefGuestName: string;

    @Column()
    about: string;

    @Column()
    contactNumber: string;

    @Column()
    emailId: string;

    @Column()
    businessName: string;

    @Column()
    businessCategory: ObjectId;

    @Column()
    referredBy: ObjectId;

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
    updatedBy: ObjectId;

}
