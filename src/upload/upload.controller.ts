import { 
  Controller, 
  Post, 
  UploadedFile, 
  UseInterceptors,
  BadRequestException 
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadService } from './upload.service';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';

@ApiTags('upload')
@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post('excel')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
      },
      fileFilter: (req, file, callback) => {
        if (!file.originalname.match(/\.(xlsx|xls)$/)) {
          return callback(new BadRequestException('Only Excel files are allowed'), false);
        }
        callback(null, true);
      },
    })
  )
  async uploadExcel(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    return this.uploadService.parseAndSaveExcel(file);
  }
}
