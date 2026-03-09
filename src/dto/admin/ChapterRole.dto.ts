import { IsMongoId } from "class-validator";

export class AssignChapterRoleDto {
  @IsMongoId()
  chapterId: string;

  @IsMongoId()
  roleId: string;

  @IsMongoId()
  memberId: string;
}
