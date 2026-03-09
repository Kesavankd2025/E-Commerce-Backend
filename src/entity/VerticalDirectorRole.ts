import {
    Entity,
    ObjectIdColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    Index
} from "typeorm";
import { ObjectId } from "mongodb";

@Entity("vertical_director_roles")
export class VerticalDirectorRole {
    @ObjectIdColumn()
    _id: ObjectId;

    @Index({ unique: true })
    @Column()
    name: string;

    @Index({ unique: true })
    @Column()
    code: string;

    @Column({ default: 1 })
    isActive: number;

    @Column({ default: 0 })
    isDelete: number;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
