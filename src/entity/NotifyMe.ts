import { Entity, ObjectIdColumn, Column, CreateDateColumn, UpdateDateColumn } from "typeorm";
import { ObjectId } from "mongodb";

@Entity("notifyme")
export class NotifyMe {
    @ObjectIdColumn()
    id: ObjectId;

    @Column({ nullable: true })
    userId: ObjectId;

    @Column({ nullable: true })
    email: string;

    @Column({ nullable: true })
    guestId: string;

    @Column()
    productId: ObjectId;

    @Column("simple-json", { nullable: true })
    combination: {
        attributeId: ObjectId;
        valueId: ObjectId;
        value: string;
    }[];

    @Column({ default: "pending" })
    status: string; // pending, notified

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
