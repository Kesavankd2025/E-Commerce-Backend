import {
    Entity,
    ObjectIdColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn
} from "typeorm";
import { ObjectId } from "mongodb";

@Entity("power_date")
export class PowerDate {

    @Column("simple-json", { nullable: true })
    image?: {
        fileName?: string;
        path?: string;
        originalName?: string;
    };

    @ObjectIdColumn()
    _id: ObjectId;

    // 1. members - array of strings (ObjectIds)
    @Column()
    members: ObjectId[];

    // 2. meeting status
    @Column()
    meetingStatus: string;

    // 3. name
    @Column()
    name: string;

    // 4. phoneNumber
    @Column()
    phoneNumber: string;

    // 5. email
    @Column()
    email: string;

    // 6. address
    @Column()
    address: string;

    // 7. rating
    @Column()
    rating: number;

    // 8. comments
    @Column({ nullable: true })
    comments: string;

    // 9. companyName
    @Column({ nullable: true })
    companyName: string;

    // 10. businessCategory
    @Column({ nullable: true })
    businessCategory: string;

    // Standard fields
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
