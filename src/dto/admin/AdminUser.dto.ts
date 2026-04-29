import {
    IsEmail,
    IsString,
    IsNotEmpty,
    IsOptional,
    IsMongoId,
    Length,
    IsPhoneNumber
} from "class-validator";
import { Type } from "class-transformer";

export class CreateAdminUserDto {
    @IsString()
    @IsNotEmpty()
    name: string;

    @IsOptional()
    profileImage?: {
        fileName?: string;
        path?: string;
        originalName?: string;
    };

    @IsEmail()
    @IsOptional()
    email?: string;

    @IsString()
    @IsNotEmpty()
    phoneNumber: string;

    @Length(4, 6)
    @IsString()
    pin: string;

    @IsMongoId()
    roleId: string;

    @IsOptional()
    @Type(() => Number)
    isActive?: number;

}
export class UpdateAdminUserDto {
    @IsOptional()
    @IsString()
    name?: string;

    @IsOptional()
    profileImage?: {
        fileName?: string;
        path?: string;
        originalName?: string;
    };

    @IsOptional()
    @IsEmail()
    email?: string;

    @IsOptional()
    @IsString()
    phoneNumber?: string;

    @IsOptional()
    @IsString()
    @Length(4, 6)
    pin?: string;

    @IsOptional()
    @IsMongoId()
    roleId?: string;

    @IsOptional()
    @Type(() => Number)
    isActive?: number;
}