import {
    Entity,
    ObjectIdColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn
} from "typeorm";
import { ObjectId } from "mongodb";

@Entity("connection_request")
export class ConnectionRequests {
    @ObjectIdColumn()
    _id: ObjectId;

    // 1. members - array of strings (ObjectIds)
    @Column()
    memberId: ObjectId;

    // 2. meeting status
    @Column()
    status: string;

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
