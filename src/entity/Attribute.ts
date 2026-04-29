import { Entity, ObjectIdColumn, Column, CreateDateColumn, UpdateDateColumn } from "typeorm";
import { ObjectId } from "mongodb";

@Entity("attributes")
export class Attribute {
    @ObjectIdColumn()
    id: ObjectId;

    @Column({ nullable: true })
    name: string;

    @Column("simple-json", { nullable: true })
    values: { _id?: ObjectId, name: string, image?: any, isFilter: boolean }[];

    @Column({ nullable: true })
    displayName: string;

    @Column({ nullable: true })
    description: string;

    @Column({ nullable: true })
    status: boolean;

    @Column("simple-json", { nullable: true })
    image?: {
        fileName?: string;
        path?: string;
        originalName?: string;
    };

    @Column({ default: 0 })
    isDelete: number;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @Column({ nullable: true })
    createdBy?: ObjectId;

    @Column({ nullable: true })
    updatedBy?: ObjectId;
}
