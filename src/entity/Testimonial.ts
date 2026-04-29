import { Entity, ObjectIdColumn, Column, CreateDateColumn, UpdateDateColumn } from "typeorm";
import { ObjectId } from "mongodb";

@Entity("testimonials")
export class Testimonial {
    @ObjectIdColumn()
    id: ObjectId;

    @Column({ nullable: true })
    clientName: string;

    @Column({ nullable: true })
    title: string;

    @Column({ nullable: true })
    message: string;

    @Column({ default: 5 })
    rating: number; // 1-5 stars

    @Column({ default: true })
    status: boolean;

    @Column({ default: 0 })
    isDelete: number;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @Column({ default: 0 })
    displayOrder: number;
}
