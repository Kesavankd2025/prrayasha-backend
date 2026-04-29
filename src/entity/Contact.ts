import { Entity, ObjectIdColumn, Column, CreateDateColumn, UpdateDateColumn } from "typeorm";
import { ObjectId } from "mongodb";

@Entity("contact_enquiries")
export class Contact {
    @ObjectIdColumn()
    id: ObjectId;

    @Column()
    fullName: string;

    @Column()
    email: string;

    @Column()
    mobileNumber: string;

    @Column()
    message: string;

    @Column({ default: 0 })
    isDelete: number;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
