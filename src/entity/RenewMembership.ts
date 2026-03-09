import { ObjectId } from "mongodb";
import { Column, CreateDateColumn, Entity, ObjectIdColumn } from "typeorm";

@Entity("membership_renewals")
export class MembershipRenewal {

    @ObjectIdColumn()
    id: ObjectId;

    @Column()
    memberId: ObjectId;

    @Column()
    amount: number;

    @Column()
    years: number;

    @Column()
    paymentMode: string;  //Cash | UPI | Card | BankTransfer

    @Column({ nullable: true })
    transactionId?: string;

    @Column({ nullable: true })
    previousHistoryId?: ObjectId;

    @Column()
    paymentDate: Date;

    @Column()
    previousRenewalDate: Date;

    @Column()
    newRenewalDate: Date;

    @Column()
    createdBy: ObjectId;

    @CreateDateColumn()
    createdAt: Date;
}
