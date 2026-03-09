import { ObjectId } from "mongodb";
import { Entity, ObjectIdColumn, Column, CreateDateColumn, UpdateDateColumn } from "typeorm";

@Entity("suspension_history")
export class SuspensionHistory {
    @ObjectIdColumn()
    id: ObjectId;

    @Column()
    memberId: ObjectId;

    @Column()
    reason: string; // "Admin Toggle", "Renewal Expiry", "Absent Limit Crossed", "Proxy Limit Crossed"

    @Column()
    action: string; // "Suspended", "Activated"

    @Column()
    actionBy: ObjectId | "System";

    @Column({ default: 0 })
    isDelete: number;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
