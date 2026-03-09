import {
    Entity,
    ObjectIdColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    Index
} from "typeorm";
import { ObjectId } from "mongodb";

@Entity("vertical_director_history")
@Index(["roleId", "memberId"])
export class VerticalDirectorHistory {

    @ObjectIdColumn()
    _id: ObjectId;

    @Column()
    roleId: ObjectId;

    @Column()
    memberId: ObjectId;

    @Column()
    startDate: Date;

    @Column({ nullable: true })
    endDate: Date | null;

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
}
