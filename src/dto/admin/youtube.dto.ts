import { IsOptional, IsString, IsBoolean, IsObject } from "class-validator";

export class CreateYoutubeDto {
    @IsObject()
    @IsOptional()
    image?: any;

    @IsString()
    @IsOptional()
    url?: string;

    @IsBoolean()
    @IsOptional()
    status?: boolean;
}

export class UpdateYoutubeDto {
    @IsObject()
    @IsOptional()
    image?: any;

    @IsString()
    @IsOptional()
    url?: string;

    @IsBoolean()
    @IsOptional()
    status?: boolean;
}
