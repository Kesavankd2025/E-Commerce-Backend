import {
    Entity,
    ObjectIdColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    Index
} from "typeorm";
import { ObjectId } from "mongodb";

@Entity("vertical_director_assignments")
@Index(["roleId"], { unique: true })
export class VerticalDirectorAssignment {

    @ObjectIdColumn()
    _id: ObjectId;

    @Column()
    roleId: ObjectId;

    @Column()
    memberId: ObjectId;

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
