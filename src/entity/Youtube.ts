import { Entity, ObjectIdColumn, ObjectId, Column, CreateDateColumn, UpdateDateColumn } from "typeorm";

@Entity()
export class Youtube {
    @ObjectIdColumn()
    _id: ObjectId;

    @Column()
    image: {
        fileName: string;
        path: string;
        originalName: string;
    };

    @Column()
    url: string;

    @Column({ default: true })
    status: boolean;

    @Column({ default: 0 })
    isDelete: number;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
