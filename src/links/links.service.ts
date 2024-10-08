import { Injectable, NotFoundException } from '@nestjs/common';
import { DeleteResult, LessThanOrEqual, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { CreateLinkDto, UpdateLinkDto } from '@links/dto';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Link } from '@links/entities/link.entity';
import { VisitsService } from '@visits/visits.service';
import { User } from '@users/entities/user.entity';
import { shortenURL } from '@libs/link';
import { VisitorInformation } from '@shared/interfaces/visitor';
import { ErrorManager } from '@shared/exceptions/ExceptionManager';

@Injectable()
export class LinksService {
  constructor(
    @InjectRepository(Link)
    private readonly linksRepository: Repository<Link>,
    private readonly visitsService: VisitsService,
  ) {}

  async findAll(userId: string): Promise<Link[]> {
    try {
      const links = await this.linksRepository.find({
        where: { user: { id: userId } },
      });

      return links;
    } catch (error) {
      throw new ErrorManager(error, 'failed to find links');
    }
  }

  async findOne(id: string): Promise<Link> {
    try {
      const link = await this.linksRepository.findOneBy({ id });

      if (!link?.id) {
        throw new NotFoundException(`link with id ${id} not found`);
      }

      return link;
    } catch (error) {
      throw new ErrorManager(error);
    }
  }

  async findOriginalUrl(
    shortURL: string,
    visitor: VisitorInformation,
  ): Promise<Link> {
    try {
      const link = await this.linksRepository.findOne({ where: { shortURL } });

      if (!link?.id) throw new NotFoundException('link not found');

      await this.visitsService.create({
        ...visitor,
        link,
      });

      return link;
    } catch (error) {
      throw new ErrorManager(error);
    }
  }

  async create(
    createLinkDto: CreateLinkDto,
    user: User | undefined,
  ): Promise<Link> {
    try {
      const shortURL = await this.generateShortURL();

      let newLink = {
        ...createLinkDto,
        shortURL,
      } as Link;

      if (user?.id) {
        newLink = { ...newLink, user: user } as Link;
      }

      const link = this.linksRepository.create(newLink);

      return await this.linksRepository.save(link);
    } catch (error) {
      throw new ErrorManager(error, `can't create a new link`);
    }
  }

  async update(id: string, updateLinkDto: UpdateLinkDto): Promise<Link> {
    try {
      const shortURL = await this.generateShortURL();

      const link = await this.linksRepository.findOneBy({ id });

      if (!link?.id) {
        throw new NotFoundException(`link with id ${id} doesn't exist`);
      }

      link.urlOriginal = updateLinkDto.urlOriginal;
      link.shortURL = shortURL;

      return await this.linksRepository.save(link);
    } catch (error) {
      throw new ErrorManager(error, `can't update the link`);
    }
  }

  async remove(id: string): Promise<DeleteResult> {
    try {
      const link = await this.linksRepository.findOne({ where: { id } });
      if (!link?.id)
        throw new NotFoundException(`link with id ${id} doesn't exist`);

      return await this.linksRepository.delete(id);
    } catch (error) {
      throw new ErrorManager(error, `can't delete the link`);
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleCron() {
    try {
      const now = new Date();

      await this.linksRepository.update(
        { expirationDate: LessThanOrEqual(now), status: true },
        { status: false },
      );

      await this.linksRepository.delete({
        status: false,
        expirationDate: LessThanOrEqual(now),
      });
    } catch (error) {
      throw new ErrorManager(
        error,
        `can't execute the cron job for update and remove links`,
      );
    }
  }

  private async generateShortURL(): Promise<string> {
    try {
      let shortURL = shortenURL();
      let shortUrlExist = true;

      while (shortUrlExist) {
        const sameShortLink = await this.linksRepository.findOne({
          where: { shortURL },
        });

        if (!sameShortLink?.id) {
          shortUrlExist = false;
        } else {
          shortURL = shortenURL();
        }
      }

      return shortURL;
    } catch (error) {
      throw new ErrorManager(error, 'failed to generate shortURL');
    }
  }
}
