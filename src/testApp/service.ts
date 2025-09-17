import { Injectable, HttpException, HttpStatus, Logger, UnprocessableEntityException, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { PhoneNumberUtil } from 'google-libphonenumber';
import * as moment from 'moment-timezone';
import { In, Not, Repository } from 'typeorm';
import { Transactional } from 'typeorm-transactional';
import { uid } from 'uid';

import { ProgramCodeService } from './program.code.service';
import { WaitUserProgramHelperService } from './wait.user.program.helper.service';
import { ContentService } from '../content/content.service';
import { AlimTalkService } from '../external.api/alimTalk.service';
import { SendbirdService } from '../sendbird/sendbird.service';
import { SlackService } from '../slack/slack.service';
import { SubscriptionService } from '../subscription/subscription.service';
import { SubscriptionTagService } from '../subscription.tag/subscription.tag.service';
import { SurveyService } from '../survey/survey.service';
import { SystemMessageService } from '../system-message/system-message.service';
import { UserProgramService } from '../user.program/user.program.service';
import { UsersService } from '../users/users.service';

import { CoachGroup } from '../entities/coachgroup.entity';
import { CounselUserProgram } from '../entities/counsel.user.program.entity';
import { ProgramCode } from '../entities/program.code.entity';
import { ProgramMethod } from '../entities/program.method.entity';
import { UserChannel } from '../entities/user.channel.entity';
import { User } from '../entities/user.entity';
import { UserProgram } from '../entities/user.program.entity';

import { IActivatePaidMembership } from './interface/program.interface';
import { CoachAssignmentQuery } from './query/coach.assignment.query';
import { ProgramCodeFindDto } from '../admin/dto/program.code.find.dto';
import { ProgramCodeIssueModelDto } from '../admin/dto/program.code.issue.model.dto';
import { ProgramCodeModelDto } from '../admin/dto/program.code.model.dto';
import { ProgramCodeSendModelDto } from '../admin/dto/program.code.send.model.dto';
import { ProgramCodeStartDateFindDto } from '../admin/dto/program.code.start.date.find.dto';
import { ProgramMethodAllUpdateDto } from '../admin/dto/program.method.all.update.dto';
import { ProgramMethodFindDto } from '../admin/dto/program.method.find.dto';
import { ProgramMethodInOrderUpdateDto } from '../admin/dto/program.method.inorder.update.dto';
import { ProgramMethodModelDto } from '../admin/dto/program.method.model.dto';
import { ProgramMethodWeeklyUpdateDto } from '../admin/dto/program.method.weekly.update.dto';
import { CoachGroupModelDto } from '../coach/dto/coach.group.model.dto';
import { CoachSurveyAnswerListDto } from '../coach/dto/coach.survey.res.dto';
import { MemberCoachUpdateDto } from '../coach/dto/member.coach.update.dto';
import { UserProgramCoachFindDto } from '../coach/dto/user.program.coach.find.dto';
import { HandlebarMessageBuilder } from '../common/builder/handlebar.message.bulider';
import { CommonConstants } from '../common/common.constants';
import { SearchRequestDto } from '../common/dto/search.request.dto';
import { I18nResourceClass } from '../common/i18n/i18n.resource';
import { IUser } from '../common/types/user.interface';
import { AlimTalkTemplate } from '../external.api/constant/alimTalkTemplte.constant';
import { SendMessageConstants } from '../external.api/constant/sendMessage.constant';
import { AlimTalkSendMessageDTO } from '../external.api/interfaces/alimTalkMessage.interface';
import { SmsProvider } from '../external.api/sms.provider';
import { LanguageConstants } from '../language.pack/constants/language.pack.constants';
import { LanguagePackProvider } from '../language.pack/language.pack.provider';
import { MembershipConstants } from '../membership/constants/membership.constants';
import { MembershipProvider } from '../membership/membership.provider';
import { MissionProvider } from '../mission/mission.provider';
import { OrganizationConstants } from '../organization/constant/organization.constant';
import { OrganizationProvider } from '../organization/organization.provider';
import { PartnerConstant } from '../partner/constant/partner.constant';
import { OrderProvider } from '../payment/provider/order.provider';
import { PreScreeningHistoryProvider } from '../pre-screening-history/pre-screening-history.provider';
import { SystemMessageConstants } from '../system-message/system-message.constants';
import { ISendbirdSystemMessage } from '../system-message/types/system-message.interface';
import { TermsOfServiceConstants } from '../terms.of.service/constants/terms.of.service.constants';
import { TermsOfServiceProvider } from '../terms.of.service/terms.of.service.provider';
import { TermsOfServiceLoggerProvider } from '../terms.of.service.logger/terms.of.service.logger.provider';
import { UserProgramModelDto } from '../user.app/dto/user.program.model.dto';
import { UserProgramUserStartDto } from '../user.app/dto/user.program.user.start.dto';
import { DescriptionAssignmentCoachWhenType, LoggerDescriptionConstants, UserLoggerConstants } from '../user.logger/user.logger.constants';
import { UserLoggerProvider } from '../user.logger/user.logger.provider';
import { ArrayUtil } from '../utils/core/array.util';
import DateUtils from '../utils/core/date.utils';
import { sendErrorToSlack } from '../utils/external/slack.sender';
import SearchUtil from '../utils/service/search.util';

@Injectable()
export class ProgramService {
    private readonly logger = new Logger(ProgramService.name);

    constructor(
        @InjectRepository(ProgramMethod)
        private programMethodRepository: Repository<ProgramMethod>,

        @InjectRepository(ProgramCode)
        private programCodeRepository: Repository<ProgramCode>,

        @InjectRepository(UserProgram)
        private userProgramRepository: Repository<UserProgram>,

        @InjectRepository(CoachGroup)
        private coachGroupRepository: Repository<CoachGroup>,

        @InjectRepository(CounselUserProgram)
        private counselUserProgramRepository: Repository<CounselUserProgram>,

        @InjectRepository(User)
        private userRepository: Repository<User>,

        @InjectRepository(UserChannel)
        private userChannelRepository: Repository<UserChannel>,

        private configService: ConfigService,

        private userProgramService: UserProgramService,

        private usersService: UsersService,

        private subscriptionService: SubscriptionService,

        private subscriptionTagService: SubscriptionTagService,

        private contentService: ContentService,

        private surveyService: SurveyService,

        private sendbirdService: SendbirdService,

        private systemMessageService: SystemMessageService,

        private programCodeService: ProgramCodeService,

        private waitUserProgramHelperService: WaitUserProgramHelperService,

        private slackService: SlackService,

        private membershipProvider: MembershipProvider,

        private missionProvider: MissionProvider,

        private alimtalkService: AlimTalkService,

        private languagePackProvider: LanguagePackProvider,

        private smsProvider: SmsProvider,

        private userLoggerProvider: UserLoggerProvider,

        private termsOfServiceLoggerProvider: TermsOfServiceLoggerProvider,

        private termsOfServiceProvider: TermsOfServiceProvider,

        private orderProvider: OrderProvider,

        private organizationProvider: OrganizationProvider,

        private preScreeningHistoryProvider: PreScreeningHistoryProvider,
    ) {}

    async generateUniqueProgramCode(length: number): Promise<string> {
        while (true) {
            // 10자리 숫자 코드 생성
            const newCode = Math.floor(Math.random() * Math.pow(10, length))
                .toString()
                .padStart(length, '0'); // 0으로 채워서 정확한 자릿수 보장

            // DB에서 중복 확인
            const existingCode = await this.programCodeRepository.findOne({ where: { programCode: newCode } });

            if (!existingCode) {
                return newCode;
            }
        }
    }

    async createProgramCodeIssue(programCodeIssueModelDto: ProgramCodeIssueModelDto): Promise<ProgramCode[]> {
        // 구독 태그를 조회한다.
        const foundSubscriptionTag = await this.subscriptionTagService.getSubscriptionTag({ subscriptionTagId: programCodeIssueModelDto.subscriptionTagId });

        // 발급 코드 생성
        const isseuCodes = [];

        for (let i = 0; i < programCodeIssueModelDto.quantity; i++) {
            const programCodeModelDto = new ProgramCodeModelDto();
            programCodeModelDto.programCode = await this.generateUniqueProgramCode(9);
            programCodeModelDto.subscriptionTagId = programCodeIssueModelDto.subscriptionTagId;
            if (Boolean(foundSubscriptionTag.term)) {
                programCodeModelDto.term = foundSubscriptionTag.term;
            }

            programCodeModelDto.startDate = programCodeIssueModelDto.startDate;

            isseuCodes.push(programCodeModelDto);
        }

        return await this.programCodeRepository.save(isseuCodes);
    }

    async getProgramCodeByPhone(phone: string) {
        return await this.programCodeRepository.findOne({ where: { receiverPhone: phone }, order: { sentDate: CommonConstants.TYPEORM_SORT_ORDER_DESCENDING } });
    }

    async searchProgramCodeList(searchRequestDto: SearchRequestDto) {
        const queryBuilder = await this.programCodeRepository.createQueryBuilder('pc');
        queryBuilder.innerJoinAndSelect('pc.subscriptionTag', 'st');

        queryBuilder.where('1=1');

        if (searchRequestDto.searchText) {
            queryBuilder.andWhere('pc.receiverPhone LIKE :searchText', { searchText: `%${searchRequestDto.searchText}%` });
        }

        if (searchRequestDto.filterOption.status) {
            queryBuilder.andWhere(`pc.status = '${searchRequestDto.filterOption.status}'`);
        }

        if (searchRequestDto.filterOption.subscriptionTagId) {
            queryBuilder.andWhere(`pc.subscriptionTagId = ${searchRequestDto.filterOption.subscriptionTagId}`);
        }

        queryBuilder.orderBy('pc.createDate', CommonConstants.TYPEORM_SORT_ORDER_DESCENDING);

        SearchUtil.setOffset(searchRequestDto);

        queryBuilder.limit(searchRequestDto.windowSize);
        queryBuilder.offset(searchRequestDto.offset);

        searchRequestDto.totalCount = await queryBuilder.getCount();
        SearchUtil.setLastPages(searchRequestDto);
        return await queryBuilder.disableEscaping().getMany();
    }

    async summaryProgramCode() {
        const summary = await this.programCodeRepository.query(`
        SELECT COUNT(1) as totalCount,
               SUM(CASE WHEN status = 'W' THEN 1 ELSE 0 END) AS issueWaitCount,
               SUM(CASE WHEN status = 'D' THEN 1 ELSE 0 END) AS issuedDoneCount,
               SUM(CASE WHEN status = 'U' THEN 1 ELSE 0 END) AS usedDoneCount,
               SUM(CASE WHEN status = 'R' THEN 1 ELSE 0 END) AS removedCount
          FROM programCode
        `);

        return summary[0];
    }

    @Transactional()
    async deleteProgramCode(programCodeFindDto: ProgramCodeFindDto) {
        if (Boolean(programCodeFindDto.programCodeId)) {
            programCodeFindDto.programCodeIds.push(programCodeFindDto.programCodeId);
        }

        for (const programCodeId of programCodeFindDto.programCodeIds) {
            const foundProgramCode = await this.programCodeRepository.findOne({ where: { programCodeId: programCodeId } });

            if (!foundProgramCode) {
                // 프로그램 코드를 찾을 수 없는 경우 로그만 기록 한다.
                return console.error(`program.service> deleteProgramCode> programCode not found (${programCodeId})`);
            }

            // userProgram 에서 해당 코드가 있는 경우 status 값을 'S(중단)' 로 변경한다.
            const resultUserProgram = await this.userProgramService.stopUserProgramByAdmin(foundProgramCode.programCode);

            if (Boolean(resultUserProgram)) {
                // 프로그램 정보가 있는 경우마 처리하도록 한다.
                await this.usersService.updateUserCanceledSubscription(resultUserProgram.userId);
            }

            // 해당 코드는 삭제 상태로 변경한다.
            foundProgramCode.status = CommonConstants.PROGRAM_CODE_STATUS_REMOVED;
            foundProgramCode.updateDate = new Date();

            await this.programCodeRepository.save(foundProgramCode);

            // 구독 결제 관리에서 해당 사용자 "취소신청" 또는 "환불신청"에 '삭제'로 변경한다.
            await this.subscriptionService.updateCanceledSubscriptionByProgramCode(foundProgramCode);
        }
    }

    async getProgramCodeList(searchRequestDto: SearchRequestDto) {
        const queryBuilder = this.programCodeRepository.createQueryBuilder('pc');
        queryBuilder.innerJoinAndSelect('pc.subscriptionTag', 'st');

        queryBuilder.select('pc.programCode', I18nResourceClass.getSystemResource('program.code'));
        queryBuilder.addSelect(`DATE_FORMAT(CONVERT_TZ(pc.createDate, 'GMT', 'Asia/Seoul'), '%Y-%m-%d %H:%i:%S')`, I18nResourceClass.getSystemResource('create.date'));
        queryBuilder.addSelect('st.name', I18nResourceClass.getSystemResource('program.subscription.tag.name'));
        queryBuilder.addSelect('pc.startDate', I18nResourceClass.getSystemResource('start.date'));
        queryBuilder.addSelect('pc.term', I18nResourceClass.getSystemResource('program.code.term'));
        queryBuilder.addSelect(
            `
        CASE WHEN pc.status = '${CommonConstants.PROGRAM_CODE_STATUS_ISSUED_DONE}' THEN '${I18nResourceClass.getSystemResource('program.code.status.issued.done')}'
             WHEN pc.status = '${CommonConstants.PROGRAM_CODE_STATUS_USED_DONE}' THEN '${I18nResourceClass.getSystemResource('program.code.status.used.done')}'
             WHEN pc.status = '${CommonConstants.PROGRAM_CODE_STATUS_REMOVED}' THEN '${I18nResourceClass.getSystemResource('program.code.status.removed')}'
             ELSE '${I18nResourceClass.getSystemResource('program.code.status.wait')}' END
        `,
            I18nResourceClass.getSystemResource('program.code.status'),
        );
        queryBuilder.addSelect(`DATE_FORMAT(pc.sentDate , '%Y-%m-%d %H:%i:%S')`, I18nResourceClass.getSystemResource('program.code.sentDate'));
        queryBuilder.addSelect(`pc.receiverName`, I18nResourceClass.getSystemResource('program.code.receiverName'));
        queryBuilder.addSelect(`pc.receiverPhone`, I18nResourceClass.getSystemResource('program.code.receiverPhone'));

        queryBuilder.where('1=1');

        if (searchRequestDto.searchText) {
            queryBuilder.andWhere('pc.receiverPhone LIKE :searchText', { searchText: `%${searchRequestDto.searchText}%` });
        }

        if (searchRequestDto.filterOption.status) {
            queryBuilder.andWhere(`pc.status = '${searchRequestDto.filterOption.status}'`);
        }

        if (searchRequestDto.filterOption.subscriptionTagId) {
            queryBuilder.andWhere(`pc.subscriptionTagId = ${searchRequestDto.filterOption.subscriptionTagId}`);
        }

        return await queryBuilder.disableEscaping().getRawMany();
    }

    async assignIssueWaitProgramCode(programCodeSendModelDto: ProgramCodeSendModelDto) {
        const queryBuilder = this.programCodeRepository.createQueryBuilder();
        queryBuilder.where(`status = '${CommonConstants.PROGRAM_CODE_STATUS_ISSUE_WAIT}'`);
        queryBuilder.andWhere(`subscriptionTagId = '${programCodeSendModelDto.subscriptionTagId}'`);

        if (Boolean(programCodeSendModelDto.startDate)) {
            queryBuilder.andWhere(`startDate = '${programCodeSendModelDto.startDate}'`);
        }

        queryBuilder.orderBy('createDate', CommonConstants.TYPEORM_SORT_ORDER_ASCENDING);
        queryBuilder.limit(programCodeSendModelDto.recipients.length);

        const foundProgramCodeList = await queryBuilder.getMany();

        const phoneNumberUtil = PhoneNumberUtil.getInstance();
        for (let i = 0; i < foundProgramCodeList.length; i++) {
            const programCode = foundProgramCodeList[i];
            programCode.receiverName = programCodeSendModelDto.recipients[i].name;

            const parsedNumber = phoneNumberUtil.parse(programCodeSendModelDto.recipients[i].phone, 'KR');
            const phoneNumber = phoneNumberUtil.formatInOriginalFormat(parsedNumber);

            // 전화번호에 '-' 있으면 제외시킨다.
            programCodeSendModelDto.recipients[i].phone = phoneNumber.replace(/-/gi, '');

            programCode.receiverPhone = programCodeSendModelDto.recipients[i].phone;
        }

        return foundProgramCodeList;
    }

    async updateSentReulstProgramCode(foundProgramCodeList: ProgramCode[]) {
        await this.programCodeRepository.save(foundProgramCodeList);
    }

    async updateProgramCodeUsed(programCode: ProgramCode) {
        // 프로그램 코드를 사용으로 변경한다
        await this.programCodeRepository.save(programCode);
    }

    async getProgramCodeStartDate(programCodeStartDateFindDto: ProgramCodeStartDateFindDto) {
        const queryBuilder = this.programCodeRepository.createQueryBuilder();
        queryBuilder.select(`DATE_FORMAT(startDate, '%Y-%m-%d') startDate`);
        queryBuilder.where(`startDate >= '${moment().tz(CommonConstants.KOREA_TIMEZONE).format(CommonConstants.DATE_FORMAT)}'`);
        queryBuilder.andWhere(`subscriptionTagId = ${programCodeStartDateFindDto.subscriptionTagId}`);
        queryBuilder.orderBy('startDate', CommonConstants.TYPEORM_SORT_ORDER_DESCENDING);
        queryBuilder.groupBy('startDate');
        return queryBuilder.getRawMany();
    }

    async getUserProgramIds(searchRequestDto: SearchRequestDto) {
        const queryBuilder = this.userProgramRepository.createQueryBuilder('userProgram');

        queryBuilder.select('userProgram.userProgramId');
        queryBuilder.addSelect('SUM(CASE WHEN cg.coachGroupId IS NOT NULL THEN 0 ELSE 1 END)', 'coachCount');
        queryBuilder.innerJoinAndSelect('userProgram.user', 'u');
        queryBuilder.leftJoinAndSelect('userProgram.coachGroups', 'cg');

        queryBuilder.where('1=1');
        queryBuilder.where(`userProgram.programId = '${searchRequestDto.filterOption.programId}'`);

        // 필터 조건 : 코치 ID
        if (searchRequestDto.filterOption.coachIds) {
            if (Object.keys(searchRequestDto.filterOption.coachIds).length > 0) {
                queryBuilder.andWhere(`cg.userId IN(:...coachIds)`, { coachIds: searchRequestDto.filterOption.coachIds });
            }
        }

        // 정렬 조건 : 이름
        if (searchRequestDto.orderOption.name) {
            queryBuilder.addOrderBy('u.name', searchRequestDto.orderOption.name);
        }

        // 정렬 조건 : 별칭
        if (searchRequestDto.orderOption.nickName) {
            queryBuilder.addOrderBy('u.nickName', searchRequestDto.orderOption.nickName);
        }

        // 정렬 조건 : 생년월일
        if (searchRequestDto.orderOption.birthday) {
            queryBuilder.addOrderBy('u.birthday', searchRequestDto.orderOption.birthday);
        }

        // 정렬 조건 : 성별
        if (searchRequestDto.orderOption.sex) {
            queryBuilder.addOrderBy('u.sex', searchRequestDto.orderOption.sex);
        }

        // 정렬 조건 : 프로그램 시작일
        if (searchRequestDto.orderOption.startDate) {
            queryBuilder.addOrderBy('userProgram.startDate', searchRequestDto.orderOption.startDate);
        }

        // 정렬 조건 : 프로그램 코드
        if (searchRequestDto.orderOption.programCode) {
            queryBuilder.addOrderBy('userProgram.programCode', searchRequestDto.orderOption.programCode);
        }

        // 정렬 조건이 없는 경우 정렬 정책 [https://well-check.atlassian.net/browse/DIET-692]
        if (Object.keys(searchRequestDto.orderOption).length === 0) {
            queryBuilder.orderBy('coachCount', CommonConstants.TYPEORM_SORT_ORDER_DESCENDING);
            queryBuilder.addOrderBy('userProgram.createDate', CommonConstants.TYPEORM_SORT_ORDER_DESCENDING);
        }

        queryBuilder.groupBy('userProgram.userProgramId');

        SearchUtil.setOffset(searchRequestDto);

        queryBuilder.limit(searchRequestDto.windowSize);
        queryBuilder.offset(searchRequestDto.offset);

        searchRequestDto.totalCount = await queryBuilder.getCount();
        SearchUtil.setLastPages(searchRequestDto);
        return await queryBuilder.getMany();
    }

    async getUserProgramList(searchRequestDto: SearchRequestDto, userPrograms: UserProgram[]) {
        const queryBuilder = this.userProgramRepository.createQueryBuilder('userProgram');

        queryBuilder.addSelect('CASE WHEN cg.coachGroupId IS NOT NULL THEN 0 ELSE 1 END', 'coachCount');
        queryBuilder.innerJoinAndSelect('userProgram.user', 'u');
        queryBuilder.leftJoinAndSelect('userProgram.coachGroups', 'cg');

        queryBuilder.whereInIds(userPrograms);

        // 정렬 조건 : 이름
        if (searchRequestDto.orderOption.name) {
            queryBuilder.addOrderBy('u.name', searchRequestDto.orderOption.name);
        }

        // 정렬 조건 : 별칭
        if (searchRequestDto.orderOption.nickName) {
            queryBuilder.addOrderBy('u.nickName', searchRequestDto.orderOption.nickName);
        }

        // 정렬 조건 : 생년월일
        if (searchRequestDto.orderOption.birthday) {
            queryBuilder.addOrderBy('u.birthday', searchRequestDto.orderOption.birthday);
        }

        // 정렬 조건 : 성별
        if (searchRequestDto.orderOption.sex) {
            queryBuilder.addOrderBy('u.sex', searchRequestDto.orderOption.sex);
        }

        // 정렬 조건 : 프로그램 시작일
        if (searchRequestDto.orderOption.startDate) {
            queryBuilder.addOrderBy('userProgram.startDate', searchRequestDto.orderOption.startDate);
        }

        // 정렬 조건 : 프로그램 코드
        if (searchRequestDto.orderOption.programCode) {
            queryBuilder.addOrderBy('userProgram.programCode', searchRequestDto.orderOption.programCode);
        }

        // 정렬 조건이 없는 경우 정렬 정책 [https://well-check.atlassian.net/browse/DIET-692]
        if (Object.keys(searchRequestDto.orderOption).length === 0) {
            queryBuilder.orderBy('coachCount', CommonConstants.TYPEORM_SORT_ORDER_DESCENDING);
            queryBuilder.addOrderBy('userProgram.createDate', CommonConstants.TYPEORM_SORT_ORDER_DESCENDING);
        }

        return await queryBuilder.disableEscaping().getMany();
    }

    async updateUserProgramCoachGroup(coachGroupModelDto: CoachGroupModelDto) {
        for (const userProgramId of coachGroupModelDto.userProgramIds) {
            const foundUserProgram = await this.userProgramRepository.findOne({ where: { userProgramId: userProgramId } });

            if (!foundUserProgram) {
                // 로그만 기록한다.
                console.error(`program.service> updateUserProgramCoachGroup> userProgram not found (${userProgramId})`);
                continue;
            }

            // 기존 등록된 코치 정보를 불려온다.
            const oldCoachGroupList = await this.coachGroupRepository.find({ where: { userProgramId: userProgramId } });

            // 신규로 올라온 정보를 추가한다.
            for (const coach of coachGroupModelDto.coaches) {
                const foundUser = await this.usersService.getCoach({ userId: coach.userId });

                const coachGroup = new CoachGroup();
                coachGroup.userProgramId = userProgramId;
                coachGroup.userId = foundUser.userId;
                coachGroup.memberUserId = foundUserProgram.userId;
                coachGroup.name = foundUser.name;

                await this.coachGroupRepository.save(coachGroup);
            }

            // 코치가 정상적으로 등록되면 이전 코치 정보를 삭제한다.
            if (oldCoachGroupList.length > 0) {
                await this.coachGroupRepository.remove(oldCoachGroupList);
            }
        }
    }

    @Transactional()
    async updateMemberCoach(user: IUser, memberCoachUpdateDto: MemberCoachUpdateDto) {
        const { coachId, members } = memberCoachUpdateDto;

        const foundCoach = await this.usersService.getCoach({ userId: coachId });

        // 활성화 되지 않은 코치인데 변경하려 할떄
        if (foundCoach.coachStatus === CommonConstants.COACH_STATUS_INACTIVITY) {
            throw new HttpException(
                {
                    statusCode: HttpStatus.BAD_REQUEST,
                    message: '코치 배정에 실패하였습니다.',
                    code: 'CUP017',
                },
                HttpStatus.BAD_REQUEST,
            );
        }

        let foundHeadCoach: User;
        if (foundCoach.parentCoachId) {
            foundHeadCoach = await this.usersService.getCoach({ userId: foundCoach.parentCoachId });

            // 샌드버드 없으면 생성시켜줌
            if (!foundHeadCoach.sendbirdUserId) {
                // headCoach sendbird 생성
                const sendbirdCoach = await this.sendbirdService.createCoach();
                foundHeadCoach.sendbirdUserId = sendbirdCoach.user_id;
                foundHeadCoach.sendbirdAccessToken = sendbirdCoach.access_token;

                await this.usersService.updateUser(foundHeadCoach);
            }
        }

        // 샌드버드 없으면 생성시켜줌
        if (!foundCoach.sendbirdUserId) {
            // headCoach sendbird 생성
            const sendbirdCoach = await this.sendbirdService.createCoach();
            foundCoach.sendbirdUserId = sendbirdCoach.user_id;
            foundCoach.sendbirdAccessToken = sendbirdCoach.access_token;
            await this.usersService.updateUser(foundCoach);
        }

        const coachGroups = await this.coachGroupRepository.find({ where: members });

        // 기존 회원들의 담당 코치 및 헤드 코치 정보를 조회한다.
        const coachIds = coachGroups.map((coachGroup) => coachGroup.userId);
        const coaches = await this.usersService.getCoaches([...new Set(coachIds)]);
        // const headCoachIds = coaches.map((coach) => coach.parentCoachId).filter(Boolean);
        // const headCoaches = await this.usersService.getCoaches(headCoachIds);

        // 회원의 담당 코치 수정.
        for (const member of members) {
            await this.coachGroupRepository.update(
                { memberUserId: member.memberUserId, userProgramId: member.userProgramId },
                { userId: foundCoach.userId, name: foundCoach.name, updateDate: new Date() },
            );
        }

        // 입력받은 메인 코치의 코칭 가능 인원이 초과되었는지 체크.
        if (foundCoach.coachType === CommonConstants.COACH_TYPE_MAIN) {
            const hasCoachCapacity = await this.checkCoachCapacity(foundCoach);
            if (!hasCoachCapacity) {
                throw new HttpException(
                    {
                        statusCode: HttpStatus.BAD_REQUEST,
                        message: '코치의 코칭 가능 인원이 초과되었습니다.',
                        code: 'CUP005',
                    },
                    HttpStatus.BAD_REQUEST,
                );
            }
        }

        // 회원의 기존 담당 코치의 채널에서 회원을 제거하고 새로운 담당 코치의 채널에 회원을 참여시킨다.
        for (const coachGroup of coachGroups) {
            // 회원 정보 설정.
            let member: User;

            try {
                member = await this.usersService.getUser({ userId: coachGroup.memberUserId });
            } catch (e2) {
                console.error('program.service> updateMemberCoach> ERROR> Not found user', e2);
                continue;
            }

            const ChannelInfo = await this.userChannelRepository.findOne({ where: { user: { userId: coachGroup.memberUserId } }, relations: { user: true, channel: true } });
            if (!ChannelInfo.channel) {
                throw new HttpException(
                    {
                        statusCode: HttpStatus.BAD_REQUEST,
                        message: '코치 배정에 실패하였습니다.',
                        code: 'PS025',
                    },
                    HttpStatus.BAD_REQUEST,
                );
            }
            // 기존 메인 코치와 헤드 코치 정보 매칭.
            const prevCoach = coaches.find((coach) => coach.userId === coachGroup.userId);
            /*
            let prevHeadCoach: User;
            if (prevCoach.parentCoachId) {
                prevHeadCoach = headCoaches.find((headCoach) => headCoach.userId === prevCoach.parentCoachId);
            }
            // 신규 메인 코치 채널 등록
            let result = await this.usersService.joinCoachToUserChannel(member, foundCoach, [foundCoach.sendbirdUserId]);
            if (result.error) {
                console.error('program.service> updateMemberCoach> ERROR> 메인 코치 배정 실패');
                console.error(result.error);
                throw new HttpException(
                    {
                        statusCode: HttpStatus.BAD_REQUEST,
                        message: '코치 배정에 실패하였습니다.',
                        code: 'PS025',
                    },
                    HttpStatus.BAD_REQUEST,
                );
            }

            // 신규 헤드 코치 채널 등록
            if (Boolean(foundHeadCoach)) {
                console.error('program.service> updateMemberCoach> ERROR> 헤드 코치 배정 실패', result.error);

                // operator 추가
                if ([foundCoach.sendbirdUserId, foundHeadCoach.sendbirdUserId].filter((e) => e).length !== 2) {
                    throw new HttpException(
                        {
                            statusCode: HttpStatus.BAD_REQUEST,
                            message: '코치 배정에 실패하였습니다.',
                            code: 'PS025',
                        },
                        HttpStatus.BAD_REQUEST,
                    );
                }

                result = await this.usersService.joinCoachToUserChannel(member, foundHeadCoach, [foundCoach.sendbirdUserId, foundHeadCoach.sendbirdUserId]);

                if (result.error) {
                    // 헤드 코치 채널 가입 실패하였으니 join 된 메인 코치 다시 떠나게 하기
                    await this.usersService.leaveCoachFromUserChannel(member, prevHeadCoach);
                    throw new HttpException(
                        {
                            statusCode: HttpStatus.BAD_REQUEST,
                            message: '코치 배정에 실패하였습니다.',
                            code: 'PS025',
                        },
                        HttpStatus.BAD_REQUEST,
                    );
                }
            }*/
            /*
            // 로직을 간단하게 기존 채널을 모두 해제한다.
            // 이전 메인 코치 해제
            result = await this.usersService.leaveCoachFromUserChannel(member, prevCoach);
            if (result.error) {
                console.error('program.service> updateMemberCoach> ERROR> 메인 코치 샌드버드 채팅 삭제 실패', result.error);
                throw new HttpException(
                    {
                        statusCode: HttpStatus.BAD_REQUEST,
                        message: '코치 배정에 실패하였습니다.',
                        code: 'PS025',
                    },
                    HttpStatus.BAD_REQUEST,
                );
            }

            // 이전 해드 코치 채널 해제
            if (Boolean(prevHeadCoach)) {
                console.error('program.service> updateMemberCoach> ERROR> 헤드 코치 샌드버드 채팅 삭제 실패', result.error);
                result = await this.usersService.leaveCoachFromUserChannel(member, prevHeadCoach);
                if (result.error) {
                    throw new HttpException(
                        {
                            statusCode: HttpStatus.BAD_REQUEST,
                            message: '코치 배정에 실패하였습니다.',
                            code: 'PS025',
                        },
                        HttpStatus.BAD_REQUEST,
                    );
                }
            }*/
            // 사용자 로거 추가
            await this.userLoggerProvider.saveOneWeldaUserLoggerWithUser(
                member.userId,
                UserLoggerConstants.CHANGE_TYPE.UPDATE,
                UserLoggerConstants.WELDA.ASSIGNMENT_COACH,
                coachGroup,
                {
                    coachGroupId: coachGroup.coachGroupId,
                    tenantId: coachGroup.tenantId,
                    userId: foundCoach.userId, // 코치 아이디 변경 됨
                    memberUserId: coachGroup.memberUserId,
                    name: foundCoach.name, // 코치 이름 변경
                    userProgramId: coachGroup.userProgramId,
                    createDate: coachGroup.createDate,
                    updateDate: new Date(),
                },
                UserLoggerConstants.OPERATOR_TYPE.ADMIN,
                user.userId,
                LoggerDescriptionConstants.AssignmentWhenStatus.ADMIN,
            );

            // 샌드버드, 유저채널에서 삭제를 제외시킬 사용자
            const withoutUsers = [foundCoach, member];
            const operatorIds = [foundCoach.sendbirdUserId];
            if (Boolean(foundHeadCoach)) {
                withoutUsers.push(foundHeadCoach);
                operatorIds.push(foundHeadCoach.sendbirdUserId);
            }

            const remainUsers = await this.usersService.leaveSendbirdChannelWithoutUsers(ChannelInfo.channel.channelUrl, withoutUsers, ChannelInfo.channel.channelId);

            if (remainUsers.length > 0) {
                // 가입 로직
                for (let i = 0; i < remainUsers.length; i++) {
                    await this.usersService.joinCoachToUserChannel(member, remainUsers[i], []);
                    if (i === remainUsers.length - 1) {
                        await this.usersService.joinCoachToUserChannel(member, remainUsers[i], operatorIds);
                    }
                }
            }

            // operator 마지막으로 체크한다.
            await this.usersService.checkSendbirdOperator(ChannelInfo.channel.channelUrl, operatorIds);
        }
    }

    /**
     * 코치가 입력받은 회원들을 코칭 가능하는지 체크하는 함수.
     */
    private async checkCoachCapacity(coach: User) {
        const coachMemberUserQuery = `SELECT f_coachingRunningUserCount(${coach.userId}, "${coach.coachType}") AS coachingRunningUserCount`;

        // 코치가 담당하는 회원 ID 목록 조회.
        const [coachGroup] = await this.coachGroupRepository.query(coachMemberUserQuery);

        const coachMemberCount = coachGroup ? coachGroup.coachingRunningUserCount : 0;
        if (coach.coachCapacity - coachMemberCount >= 0) {
            return true;
        } else {
            return false;
        }
    }

    async getUserProgramCoachGroup(userProgramCoachFindDto: UserProgramCoachFindDto, coachType) {
        const queryBuilder = this.coachGroupRepository.createQueryBuilder('cg');
        queryBuilder.where(`cg.userProgramId = '${userProgramCoachFindDto.userProgramId}'`);

        if (coachType === CommonConstants.COACH_TYPE_HEAD) {
            return await queryBuilder.getOne();
        }

        return await queryBuilder.getMany();
    }

    async getCountContinuousUser() {
        const query = await this.userProgramRepository.query(`
        SELECT COUNT(DISTINCT up.userId) AS count
          FROM userProgram as up
         WHERE up.status = '${CommonConstants.USER_PROGRAM_STATUS_MAINTAIN}'
        `);
        return query[0].count;
    }

    async getAllMyCoachingCountInfo(coach) {
        const query = await this.userProgramRepository.query(`
        SELECT
               SUM(CASE WHEN up.status = '${CommonConstants.USER_PROGRAM_STATUS_RUNNING}' THEN 1 ELSE 0 END) as totalCount,
               SUM(CASE WHEN u.userStatus = '${CommonConstants.USER_STATUS_ACTIVITY}' THEN 1 ELSE 0 END) as activityUserCount,
               SUM(CASE WHEN u.userStatus = '${CommonConstants.USER_STATUS_INTENSIVE}' THEN 1 ELSE 0 END) as intensiveUserCount,
               SUM(CASE WHEN u.userStatus = '${CommonConstants.USER_STATUS_INACTIVITY}' THEN 1 ELSE 0 END) as inactivityUserCount,
               SUM(CASE WHEN u.userStatus = '${CommonConstants.USER_STATUS_DORMENT}' THEN 1 ELSE 0 END) as dormentUserCount
          FROM userProgram as up, user as u, coachGroup as cg
         WHERE up.userProgramId = cg.userProgramId
           AND u.userId = up.userId
           AND up.status = '${CommonConstants.USER_PROGRAM_STATUS_RUNNING}'
           AND cg.userId = ${coach.userId}
        `);

        // 정보가 없는 경우 값을 0 으로 치환한다.
        if (!query[0].totalCount) {
            query[0].totalCount = 0;
        }

        if (!query[0].activityUserCount) {
            query[0].activityUserCount = 0;
        }

        if (!query[0].intensiveUserCount) {
            query[0].intensiveUserCount = 0;
        }

        if (!query[0].inactivityUserCount) {
            query[0].inactivityUserCount = 0;
        }

        if (!query[0].dormentUserCount) {
            query[0].dormentUserCount = 0;
        }

        return query[0];
    }

    async getMyCoachingProgramList(coach) {
        const targetDay = moment(new Date());

        // 일요일 경우, 주의 시작이 일요일 이므로 월요일을 지정하면, 차주의 시작일이므로, -1일로 처리 한다.
        if (targetDay.day() === CommonConstants.DAY_OF_WEEK_SUNDAY) {
            targetDay.subtract(1, 'day');
        }

        const thisWeekStartDate = targetDay.day(CommonConstants.DAY_OF_WEEK_MONDAY).format(CommonConstants.DATE_FORMAT);

        /*
        TODO: 쿼리를 다시 구현해야 한다.
        const myCoachingProgramList = await this.programCodeRepository.query(`
            SELECT p.*, cup.weekly, cup.userId as coachUserId
              FROM program as p, (
                   SELECT cup.programId, cup.weekly, cg.userId
                     FROM counselUserProgram as cup, coachGroup as cg
                    WHERE cup.userProgramId = cg.userProgramId
                      AND cup.weeklyStartDate = '${thisWeekStartDate}'
                      AND cg.userId = ${coach.userId}
                    GROUP BY cup.programId, cup.weekly
                   ) as cup
             WHERE p.programId = cup.programId
               AND cup.status = '${CommonConstants.PROGRAM_STATUS_RUNNING}'
        `);
        */

        const myCoachingProgramList = [];

        for (const program of myCoachingProgramList) {
            const summary = await this.userProgramRepository.query(`
                SELECT
                       SUM(CASE WHEN up.status = '${CommonConstants.USER_PROGRAM_STATUS_RUNNING}' THEN 1 ELSE 0 END) as totalCount,
                       SUM(CASE WHEN u.userStatus = '${CommonConstants.USER_STATUS_ACTIVITY}' THEN 1 ELSE 0 END) as activityUserCount,
                       SUM(CASE WHEN u.userStatus = '${CommonConstants.USER_STATUS_INTENSIVE}' THEN 1 ELSE 0 END) as intensiveUserCount,
                       SUM(CASE WHEN u.userStatus = '${CommonConstants.USER_STATUS_INACTIVITY}' THEN 1 ELSE 0 END) as inactivityUserCount,
                       SUM(CASE WHEN u.userStatus = '${CommonConstants.USER_STATUS_DORMENT}' THEN 1 ELSE 0 END) as dormentUserCount
                  FROM userProgram as up, user as u, coachGroup as cg
                 WHERE up.userProgramId = cg.userProgramId
                   AND u.userId = up.userId
                   AND up.programId = ${program.programId}
                   AND up.status = '${CommonConstants.USER_PROGRAM_STATUS_RUNNING}'
                   AND cg.userId = ${program.coachUserId}
            `);

            // 정보가 없는 경우 값을 0 으로 치환한다.
            if (!summary[0].totalCount) {
                summary[0].totalCount = 0;
            }

            if (!summary[0].activityUserCount) {
                summary[0].activityUserCount = 0;
            }

            if (!summary[0].intensiveUserCount) {
                summary[0].intensiveUserCount = 0;
            }

            if (!summary[0].inactivityUserCount) {
                summary[0].inactivityUserCount = 0;
            }

            if (!summary[0].dormentUserCount) {
                summary[0].dormentUserCount = 0;
            }

            program.summary = summary[0];
        }

        return myCoachingProgramList;
    }

    async getMyCoachingChangedWeightCount(coach) {
        return await this.counselUserProgramRepository.query(`
            SELECT SUM(CASE WHEN calc >= 1 THEN 1 ELSE 0 END) as overWeight,
                   SUM(CASE WHEN calc <= -1 THEN 1 ELSE 0 END) as lessWeight,
                   SUM(CASE WHEN calc > -1 AND calc < 1 THEN 1 ELSE 0 END) as stayWeight
              FROM (
                    SELECT rs.userId, rs.firstBodyWeight, rs.lastBodyWeight, (rs.lastBodyWeight - rs.firstBodyWeight) as calc
                      FROM (
                            SELECT cup.userId as userId,
                                   FIRST_VALUE(cup.firstBodyWeight) OVER(PARTITION BY cup.userId ORDER BY cup.weekly ASC) as firstBodyWeight,
                                   LAST_VALUE(cup.currentBodyWeight) OVER(PARTITION BY cup.userId ORDER BY cup.weekly DESC) as lastBodyWeight,
                                   ROW_NUMBER() OVER(PARTITION BY cup.userId ORDER BY cup.weekly ASC) AS rownum
                              FROM counselUserProgram as cup, coachGroup as cg
                             WHERE cup.userProgramId = cg.userProgramId
                               AND cg.userId = ${coach.userId}
                           ) AS rs
                     WHERE rs.rownum = 1
                   ) as cal
        `);
    }

    async getMyCoachingWeeklyFeedbackTargetCount(coach) {
        const targetDay = moment(new Date());

        // 일요일 경우, 주의 시작이 일요일 이므로 월요일을 지정하면, 차주의 시작일이므로, -1일로 처리 한다.
        if (targetDay.day() === CommonConstants.DAY_OF_WEEK_SUNDAY) {
            targetDay.subtract(1, 'day');
        }

        const targetWeeklies = [];

        // 요일별 대상 주차를 설정한다.
        switch (targetDay.day()) {
            case 1:
                targetWeeklies.push(1);
                break;
            case 2:
            case 3:
            case 4:
                targetWeeklies.push(2);
                targetWeeklies.push(3);
                break;
            case 5:
                targetWeeklies.push(4);
                break;
            default:
                // ignore
                break;
        }

        let sql = `
            SELECT COUNT(1) AS feedback
              FROM counselUserProgram as cup, coachGroup as cg
             WHERE cup.userProgramId = cg.userProgramId
               AND cup.weeklyStartDate = '${targetDay.day(CommonConstants.DAY_OF_WEEK_MONDAY).format(CommonConstants.DATE_FORMAT)}'
               AND cg.userId = ${coach.userId}
        `;

        if (targetWeeklies.length > 0) {
            sql += `   AND cup.weekly IN (${targetWeeklies})`;
        }

        const result = await this.counselUserProgramRepository.query(sql);

        if (!result[0].feedback) {
            result[0].feedback = 0;
        }

        return result[0].feedback;
    }

    async getAllCoulselProgramSummary() {
        const summary = await this.userProgramRepository.query(`
                SELECT
                       SUM(CASE WHEN up.status = '${CommonConstants.USER_PROGRAM_STATUS_RUNNING}' THEN 1 ELSE 0 END) as totalCount,
                       SUM(CASE WHEN u.userStatus = '${CommonConstants.USER_STATUS_ACTIVITY}' THEN 1 ELSE 0 END) as activityUserCount,
                       SUM(CASE WHEN u.userStatus = '${CommonConstants.USER_STATUS_INTENSIVE}' THEN 1 ELSE 0 END) as intensiveUserCount,
                       SUM(CASE WHEN u.userStatus = '${CommonConstants.USER_STATUS_INACTIVITY}' THEN 1 ELSE 0 END) as inactivityUserCount,
                       SUM(CASE WHEN u.userStatus = '${CommonConstants.USER_STATUS_DORMENT}' THEN 1 ELSE 0 END) as dormentUserCount
                  FROM userProgram as up, user as u, coachGroup as cg
                 WHERE up.userProgramId = cg.userProgramId
                   AND u.userId = up.userId
                   AND up.status = '${CommonConstants.USER_PROGRAM_STATUS_RUNNING}'
            `);

        // 정보가 없는 경우 값을 0 으로 치환한다.
        if (!summary[0].totalCount) {
            summary[0].totalCount = 0;
        }

        if (!summary[0].activityUserCount) {
            summary[0].activityUserCount = 0;
        }

        if (!summary[0].intensiveUserCount) {
            summary[0].intensiveUserCount = 0;
        }

        if (!summary[0].inactivityUserCount) {
            summary[0].inactivityUserCount = 0;
        }

        if (!summary[0].dormentUserCount) {
            summary[0].dormentUserCount = 0;
        }

        return summary[0];
    }

    async getAllCoulselProgramList(searchRequestDto: SearchRequestDto) {
        // 전체 카운트를 조회한다
        const allCoulselProgramCount = await this.programCodeRepository.query(`
            SELECT COUNT(1) as allCount
              FROM (
                    SELECT cg.userId, cg.name
                      FROM userProgram as up, coachGroup as cg
                     WHERE up.userProgramId = cg.userProgramId
                       AND up.status = '${CommonConstants.USER_PROGRAM_STATUS_RUNNING}'
                     GROUP BY cg.userId, cg.name
                   ) AS rs
        `);

        if (!allCoulselProgramCount[0].allCount) {
            allCoulselProgramCount[0].allCount = 0;
        }

        SearchUtil.setOffset(searchRequestDto);

        let limitOffset = ` LIMIT ${searchRequestDto.windowSize} `;

        if (searchRequestDto.offset > 0) {
            limitOffset = limitOffset + ` OFFSET ${searchRequestDto.offset} `;
        }

        searchRequestDto.totalCount = allCoulselProgramCount[0].allCount;
        SearchUtil.setLastPages(searchRequestDto);

        const coulselCoachList = await this.counselUserProgramRepository.query(
            `
            SELECT cg.userId, cg.name
              FROM userProgram as up, coachGroup as cg
             WHERE up.userProgramId = cg.userProgramId
               AND up.status = '${CommonConstants.USER_PROGRAM_STATUS_RUNNING}'
             GROUP BY cg.userId, cg.name
             ORDER BY up.userProgramId, cg.coachType
        ` + limitOffset,
        );

        for (const coach of coulselCoachList) {
            const summary = await this.userProgramRepository.query(`
                SELECT
                       SUM(CASE WHEN up.status = '${CommonConstants.USER_PROGRAM_STATUS_RUNNING}' THEN 1 ELSE 0 END) as totalCount,
                       SUM(CASE WHEN u.userStatus = '${CommonConstants.USER_STATUS_ACTIVITY}' THEN 1 ELSE 0 END) as activityUserCount,
                       SUM(CASE WHEN u.userStatus = '${CommonConstants.USER_STATUS_INTENSIVE}' THEN 1 ELSE 0 END) as intensiveUserCount,
                       SUM(CASE WHEN u.userStatus = '${CommonConstants.USER_STATUS_INACTIVITY}' THEN 1 ELSE 0 END) as inactivityUserCount,
                       SUM(CASE WHEN u.userStatus = '${CommonConstants.USER_STATUS_DORMENT}' THEN 1 ELSE 0 END) as dormentUserCount
                  FROM userProgram as up, user as u, coachGroup as cg
                 WHERE up.userProgramId = cg.userProgramId
                   AND u.userId = up.userId
                   AND up.status = '${CommonConstants.USER_PROGRAM_STATUS_RUNNING}'
                   AND cg.userId = ${coach.userId}
            `);

            // 정보가 없는 경우 값을 0 으로 치환한다.
            if (!summary[0].totalCount) {
                summary[0].totalCount = 0;
            }

            if (!summary[0].activityUserCount) {
                summary[0].activityUserCount = 0;
            }

            if (!summary[0].intensiveUserCount) {
                summary[0].intensiveUserCount = 0;
            }

            if (!summary[0].inactivityUserCount) {
                summary[0].inactivityUserCount = 0;
            }

            if (!summary[0].dormentUserCount) {
                summary[0].dormentUserCount = 0;
            }

            coach.summary = summary[0];
        }

        return coulselCoachList;
    }

    async getWaitingProgramCodeByUser(user: User) {
        let foundWaitingProgramCode = await this.programCodeRepository.findOne({ where: { status: CommonConstants.PROGRAM_CODE_STATUS_ISSUE_WAIT } });

        // 신규 코드가 없으면 코드를 생성한다.
        if (!foundWaitingProgramCode) {
            // 발급 코드 생성
            const isseuCodes = new Array<ProgramCode>();

            for (let i = 0; i < CommonConstants.PROGRAM_CODE_CREATE_COUNT; i++) {
                const programCode = new ProgramCode();
                programCode.status = CommonConstants.PROGRAM_CODE_STATUS_ISSUE_WAIT;
                programCode.programCode = uid(10).toUpperCase();
                isseuCodes.push(programCode);
            }

            // 첫번째 코드는 신규 발급하는 사용자로 변경한다.
            isseuCodes[0].status = CommonConstants.PROGRAM_CODE_STATUS_USED_DONE;
            isseuCodes[0].receiverPhone = user.phone;
            isseuCodes[0].receiverName = user.name;
            isseuCodes[0].userId = user.userId;

            foundWaitingProgramCode = isseuCodes[0];

            await this.programCodeRepository.save(isseuCodes);
        }

        // 발급 정보를 업데이트 한다.
        if (foundWaitingProgramCode) {
            foundWaitingProgramCode.status = CommonConstants.PROGRAM_CODE_STATUS_USED_DONE;
            foundWaitingProgramCode.receiverPhone = user.phone;
            foundWaitingProgramCode.receiverName = user.name;
            foundWaitingProgramCode.userId = user.userId;
            await this.programCodeRepository.save(foundWaitingProgramCode);
        }

        return foundWaitingProgramCode;
    }

    // 프로그램 인증 코드 구현(유형) 발급대기 카운트 조회
    async getProgramCodeTypeCount(programCodeSendModelDto: ProgramCodeSendModelDto) {
        if (Boolean(programCodeSendModelDto.startDate)) {
            return await this.programCodeRepository.count({
                where: { subscriptionTagId: programCodeSendModelDto.subscriptionTagId, status: CommonConstants.PROGRAM_CODE_STATUS_ISSUE_WAIT, startDate: programCodeSendModelDto.startDate },
            });
        }

        return await this.programCodeRepository.count({ where: { subscriptionTagId: programCodeSendModelDto.subscriptionTagId, status: CommonConstants.PROGRAM_CODE_STATUS_ISSUE_WAIT } });
    }

    /* -------------------------------
    * 어드민 : 체크리스트
    --------------------------------*/
    async createMethod(programMethodModelDto: ProgramMethodModelDto) {
        const maxOrderNo = await this.programMethodRepository.countBy({ useYN: CommonConstants.USE_YES });

        // 등록 시 마지막번호로 설정한다.
        programMethodModelDto.orderNo = maxOrderNo + 1;
        await this.programMethodRepository.save(programMethodModelDto);
    }

    async getMethodList(searchRequestDto: SearchRequestDto) {
        const queryBuilder = this.programMethodRepository.createQueryBuilder();

        queryBuilder.orderBy('orderNo', CommonConstants.TYPEORM_SORT_ORDER_ASCENDING);

        SearchUtil.setOffset(searchRequestDto);

        queryBuilder.limit(searchRequestDto.windowSize);
        queryBuilder.offset(searchRequestDto.offset);

        searchRequestDto.totalCount = await queryBuilder.getCount();
        SearchUtil.setLastPages(searchRequestDto);

        return await queryBuilder.getMany();
    }

    async getMethod(programMethodFindDto: ProgramMethodFindDto) {
        const foundProgramMethod = await this.programMethodRepository.findOne({ where: programMethodFindDto });

        if (!foundProgramMethod) {
            throw new HttpException(
                {
                    statusCode: HttpStatus.BAD_REQUEST,
                    message: '습관 정보를 찾을 수 없습니다 ',
                    code: 'PS019',
                },
                HttpStatus.BAD_REQUEST,
            );
        }

        return foundProgramMethod;
    }

    async updateAllMethod(programMethodAllUpdateDto: ProgramMethodAllUpdateDto) {
        for (const programMethod of programMethodAllUpdateDto.programMethods) {
            programMethod.updateDate = new Date();
            try {
                await this.updateMethod(programMethod);
            } catch (error) {
                console.error('program.service> updateAllMethod> error', error.message);
            }
        }
    }

    async updateMethod(programMethodModelDto: ProgramMethodModelDto) {
        const foundProgramMethod = await this.programMethodRepository.findOne({ where: { programMethodId: programMethodModelDto.programMethodId } });

        if (!foundProgramMethod) {
            throw new HttpException(
                {
                    statusCode: HttpStatus.BAD_REQUEST,
                    message: '습관 정보를 찾을 수 없습니다 ',
                    code: 'PS019',
                },
                HttpStatus.BAD_REQUEST,
            );
        }

        foundProgramMethod.methodName = programMethodModelDto.methodName;
        foundProgramMethod.methodType = programMethodModelDto.methodType;

        foundProgramMethod.useYN = programMethodModelDto.useYN;
        foundProgramMethod.orderNo = programMethodModelDto.orderNo;
        foundProgramMethod.updateDate = new Date();

        await this.programMethodRepository.save(foundProgramMethod);
    }

    async updateMethodWeekly(programMethodWeeklyUpdateDto: ProgramMethodWeeklyUpdateDto) {
        const foundProgramMethod = await this.programMethodRepository.findOne({ where: { programMethodId: programMethodWeeklyUpdateDto.programMethodId } });

        if (!foundProgramMethod) {
            throw new HttpException(
                {
                    statusCode: HttpStatus.BAD_REQUEST,
                    message: '습관 정보를 찾을 수 없습니다 ',
                    code: 'PS019',
                },
                HttpStatus.BAD_REQUEST,
            );
        }

        foundProgramMethod.updateDate = new Date();

        await this.programMethodRepository.save(foundProgramMethod);
    }

    async updateMethodInorder(programMethodInOrderUpdateDto: ProgramMethodInOrderUpdateDto) {
        // 순서를 변경한다.
        for (const programMethodOrder of programMethodInOrderUpdateDto.programMethodIdOrderList) {
            await this.programMethodRepository.update(programMethodOrder.programMethodId, { orderNo: programMethodOrder.orderNo });
        }
    }

    async deleteMethod(programMethodFindDto: ProgramMethodFindDto) {
        const foundProgramMethod = await this.programMethodRepository.findOne({ where: programMethodFindDto });

        if (!foundProgramMethod) {
            throw new HttpException(
                {
                    statusCode: HttpStatus.BAD_REQUEST,
                    message: '습관 정보를 찾을 수 없습니다 ',
                    code: 'PS019',
                },
                HttpStatus.BAD_REQUEST,
            );
        }

        await this.programMethodRepository.remove(foundProgramMethod);
    }

    async getUseProgramMethodList(logType?: string) {
        const queryBuilder = this.programMethodRepository.createQueryBuilder('pm');
        queryBuilder.where(`pm.useYN = '${CommonConstants.USE_YES}'`);
        if (logType) {
            queryBuilder.andWhere(`pm.methodType = :logType`, { logType });
        }
        queryBuilder.addOrderBy(`pm.orderNo`, CommonConstants.TYPEORM_SORT_ORDER_ASCENDING);
        return await queryBuilder.getMany();
    }

    /* -------------------------------
    * 어드민 : 사용자 관리 - 구독, 구독 종료
    --------------------------------*/
    /*    async userSubscriptionByAdmin(user: User) {
        // 구분 대상의 발급대기 코드 카운트를 조회한다.
        const waitTypeCount = await this.programCodeRepository.count({
            where: { subscriptionTagId: user.subscriptionTagId, status: CommonConstants.PROGRAM_CODE_STATUS_ISSUE_WAIT, startDate: IsNull() },
        });

        if (waitTypeCount === 0) {
            // 발급대기수량이 적으면 코드를 생성한다.
            const programCodeIssueModelDto = new ProgramCodeIssueModelDto();
            programCodeIssueModelDto.quantity = 1;
            programCodeIssueModelDto.subscriptionTagId = user.subscriptionTagId;
            try {
                await this.createProgramCodeIssue(programCodeIssueModelDto);
            } catch (error) {
                throw new HttpException(
                    {
                        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
                        message: '프로그램 인증 코드 추가 생성 시 오류가 발생하였습니다.',
                        code: 'PCS001',
                    },
                    HttpStatus.INTERNAL_SERVER_ERROR,
                );
            }
        }

        // 코드를 가져온다.
        const foundProgramCode = await this.programCodeRepository.findOne({
            where: { subscriptionTagId: user.subscriptionTagId, status: CommonConstants.PROGRAM_CODE_STATUS_ISSUE_WAIT, startDate: IsNull() },
        });
        foundProgramCode.status = CommonConstants.PROGRAM_CODE_STATUS_USED_DONE;
        foundProgramCode.userId = user.userId;
        foundProgramCode.receiverName = user.name;
        foundProgramCode.receiverPhone = user.phone;
        foundProgramCode.updateDate = new Date();

        await this.programCodeRepository.save(foundProgramCode);

        // 프로그램을 시작한다.
        // 기존 진행 및 유지 프로그램을 모두 종료로 변경한다.
        await this.userProgramAllStopByAdmin(user);

        // 시작일 / 종료일을 확정한다.
        const startDate = moment(new Date()).tz(CommonConstants.KOREA_TIMEZONE);
        // endDate - 1 << 시작일을 포함하여 처리하기 때문임
        const endDate = startDate.clone().add(foundProgramCode.term - 1, 'days');

        // 사용자 프로그램을 생성한다.
        const userProgram = new UserProgram();
        userProgram.userId = user.userId;
        userProgram.programCode = foundProgramCode.programCode;
        userProgram.status = CommonConstants.USER_PROGRAM_STATUS_RUNNING;
        userProgram.startDate = startDate.format(CommonConstants.DATE_FORMAT);
        userProgram.endDate = endDate.format(CommonConstants.DATE_FORMAT);
        userProgram.subscriptionTagId = foundProgramCode.subscriptionTagId;
        userProgram.subscriptionTagName = foundProgramCode.subscriptionTagName;
        userProgram.subscriptionTagTerm = foundProgramCode.term;
        await this.userProgramRepository.save(userProgram);

        // 상담 사용자 프로그램을 생성한다.
        const weekStartDate = startDate.clone();
        const weekEndDate = weekStartDate.clone().add('6', 'days');

        const weelkyCount = Math.floor(moment.duration(endDate.diff(startDate)).asWeeks()) + 1;

        let weelky = CommonConstants.PROGRAM_WEEKLY_FIRST;
        // 시작일을 기준으로 7일씩 4주를 나누어 counselUserProgram 에 등록한다.
        while (weelky <= weelkyCount) {
            const counselUserProgram = new CounselUserProgram();
            counselUserProgram.userProgramId = userProgram.userProgramId;
            counselUserProgram.userId = userProgram.userId;
            counselUserProgram.weekly = weelky++;
            counselUserProgram.weeklyStartDate = weekStartDate.format(CommonConstants.DATE_FORMAT);
            counselUserProgram.weeklyEndDate = weekEndDate.format(CommonConstants.DATE_FORMAT);

            console.log('counselUserProgram>', counselUserProgram);
            weekStartDate.add('7', 'days');
            weekEndDate.add('7', 'days');

            // counselUserProgram 에 등록한다.
            await this.counselUserProgramRepository.save(counselUserProgram);
        }

        // 코치 자동 배정 및 체널을 등록한다.
        await this.assignmentMainCoach(user, userProgram);

        // 시작(목표설정) 터치베이스 등록
        // 신규 시작이므로 사전설문, 증상체크를 초기화 한다.
        await this.usersService.startUserTouchBase(user, moment(new Date()).tz(user.appUseTimezone).format(CommonConstants.DATE_FORMAT), true);

        // default 유저 미션을 생성해준다.
        await this.usersService.createDefaultMission(userProgram);
    }

    async userContinueSubscriptionByAdmin(user: User, foundUserProgram: UserProgram) {
        // 구분 대상의 발급대기 코드 카운트를 조회한다.
        const waitTypeCount = await this.programCodeRepository.count({
            where: { subscriptionTagId: user.subscriptionTagId, status: CommonConstants.PROGRAM_CODE_STATUS_ISSUE_WAIT, startDate: IsNull() },
        });

        if (waitTypeCount === 0) {
            // 발급대기수량이 적으면 코드를 생성한다.
            const programCodeIssueModelDto = new ProgramCodeIssueModelDto();
            programCodeIssueModelDto.quantity = 1;
            programCodeIssueModelDto.subscriptionTagId = user.subscriptionTagId;
            try {
                await this.createProgramCodeIssue(programCodeIssueModelDto);
            } catch (error) {
                throw new HttpException(
                    {
                        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
                        message: '프로그램 인증 코드 추가 생성 시 오류가 발생하였습니다.',
                        code: 'PCS001',
                    },
                    HttpStatus.INTERNAL_SERVER_ERROR,
                );
            }
        }

        // 코드를 가져온다.
        const foundProgramCode = await this.programCodeRepository.findOne({
            where: { subscriptionTagId: user.subscriptionTagId, status: CommonConstants.PROGRAM_CODE_STATUS_ISSUE_WAIT, startDate: IsNull() },
        });
        foundProgramCode.status = CommonConstants.PROGRAM_CODE_STATUS_USED_DONE;
        foundProgramCode.userId = user.userId;
        foundProgramCode.receiverName = user.name;
        foundProgramCode.receiverPhone = user.phone;
        foundProgramCode.updateDate = new Date();

        await this.programCodeRepository.save(foundProgramCode);

        // 시작일 / 종료일을 확정한다.
        const startDate = moment(new Date()).tz(CommonConstants.KOREA_TIMEZONE);
        // endDate - 1 << 시작일을 포함하여 처리하기 때문임
        const endDate = startDate.clone().add(foundProgramCode.term - 1, 'days');

        // 현재 진행 중인 상담 프로그램의 마지막 주차를 조회한다.
        const foundLastWeeklyCounselUserProgram = await this.counselUserProgramRepository.findOne({
            where: { userId: foundUserProgram.userId, userProgramId: foundUserProgram.userProgramId },
            order: { weekly: CommonConstants.TYPEORM_SORT_ORDER_DESCENDING },
        });

        // 사용자 상담 프로그램의 마지막 주차가 조회되지 않은 경우, 최초 사용으로 변경하고 종료 한다.
        if (!foundLastWeeklyCounselUserProgram) {
            const userProgram = new UserProgram();
            userProgram.userId = user.userId;
            userProgram.programCode = foundProgramCode.programCode;
            userProgram.status = CommonConstants.USER_PROGRAM_STATUS_RUNNING;
            userProgram.joinPreviousId = foundUserProgram.userProgramId;
            userProgram.subscriptionTagId = foundProgramCode.subscriptionTagId;
            userProgram.subscriptionTagName = foundProgramCode.subscriptionTagName;
            userProgram.subscriptionTagTerm = foundProgramCode.term;
            userProgram.startDate = startDate.format(CommonConstants.DATE_FORMAT);
            userProgram.endDate = endDate.format(CommonConstants.DATE_FORMAT);
            await this.userProgramRepository.save(userProgram);

            // 상담 사용자 프로그램을 생성한다.
            const weekStartDate = moment(foundLastWeeklyCounselUserProgram.weeklyEndDate, CommonConstants.DATE_FORMAT).add(1, 'day');
            const weekEndDate = weekStartDate.clone().add('6', 'days');

            // 전체 주차, 신규 프로그램의 시작일부터 종료일까지
            const weelkyCount = Math.floor(moment.duration(endDate.diff(startDate)).asWeeks()) + 1;

            // 연속 추가될 주차
            let weelky = CommonConstants.PROGRAM_WEEKLY_FIRST;
            // 시작일을 기준으로 7일씩 4주를 나누어 counselUserProgram 에 등록한다.
            while (weelky <= weelkyCount) {
                const counselUserProgram = new CounselUserProgram();
                counselUserProgram.userProgramId = userProgram.userProgramId;
                counselUserProgram.userId = userProgram.userId;
                counselUserProgram.weekly = weelky++;
                counselUserProgram.weeklyStartDate = weekStartDate.format(CommonConstants.DATE_FORMAT);
                counselUserProgram.weeklyEndDate = weekEndDate.format(CommonConstants.DATE_FORMAT);

                console.log('counselUserProgram>', counselUserProgram);
                weekStartDate.add('7', 'days');
                weekEndDate.add('7', 'days');

                // counselUserProgram 에 등록한다.
                await this.counselUserProgramRepository.save(counselUserProgram);
            }

            // 코치 자동 배정 및 체널을 등록한다.
            await this.assignmentMainCoach(user, foundUserProgram);

            // 시작(목표설정) 터치베이스 등록
            // 최초 구독으로 설정된 경우 사전설문, 증상체크를 할 수 있도록 한다.
            await this.usersService.startUserTouchBase(user, foundUserProgram.startDate, true);

            // default 유저 미션을 생성해준다.
            await this.usersService.createDefaultMission(userProgram);

            return;
        }

        // 사용자 프로그램을 생성한다.
        const userProgram = new UserProgram();
        userProgram.userId = user.userId;
        userProgram.programCode = foundProgramCode.programCode;
        userProgram.status = CommonConstants.USER_PROGRAM_STATUS_CONTINUOUS;
        userProgram.joinPreviousId = foundUserProgram.userProgramId;
        userProgram.subscriptionTagId = foundProgramCode.subscriptionTagId;
        userProgram.subscriptionTagName = foundProgramCode.subscriptionTagName;
        userProgram.subscriptionTagTerm = foundProgramCode.term;
        userProgram.startDate = startDate.format(CommonConstants.DATE_FORMAT);
        userProgram.endDate = endDate.format(CommonConstants.DATE_FORMAT);
        await this.userProgramRepository.save(userProgram);

        // 이전 프로그램을 연속 구독으로 변경한다.
        foundUserProgram.status = CommonConstants.USER_PROGRAM_STATUS_RUNNING;
        foundUserProgram.continueCount++;

        // 연속 구독 기간 간의 유예기간 값을 더해준다.
        foundUserProgram.retentionPeriodCount += DateUtils.calculateDaysExcludingEndpoints(foundUserProgram.endDate, userProgram.startDate);

        foundUserProgram.endDate = userProgram.endDate;
        await this.userProgramRepository.save(foundUserProgram);

        // 상담 사용자 프로그램을 생성한다.
        const weekStartDate = moment(foundLastWeeklyCounselUserProgram.weeklyEndDate, CommonConstants.DATE_FORMAT).add(1, 'day');
        const weekEndDate = weekStartDate.clone().add('6', 'days');

        // 전체 주차, 이전 프로그램의 시작일부터 종료일까지
        const weelkyCount = Math.floor(moment.duration(endDate.diff(moment(foundUserProgram.startDate, CommonConstants.DATE_FORMAT))).asWeeks()) + 1;

        // 신규 추가될 주차
        let weelky = foundLastWeeklyCounselUserProgram.weekly + 1;
        // 시작일을 기준으로 7일씩 4주를 나누어 counselUserProgram 에 등록한다.
        while (weelky <= weelkyCount) {
            const counselUserProgram = new CounselUserProgram();
            counselUserProgram.userProgramId = foundUserProgram.userProgramId;
            counselUserProgram.userId = foundUserProgram.userId;
            counselUserProgram.weekly = weelky++;
            counselUserProgram.weeklyStartDate = weekStartDate.format(CommonConstants.DATE_FORMAT);
            counselUserProgram.weeklyEndDate = weekEndDate.format(CommonConstants.DATE_FORMAT);

            console.log('counselUserProgram>', counselUserProgram);
            weekStartDate.add('7', 'days');
            weekEndDate.add('7', 'days');

            // counselUserProgram 에 등록한다.
            await this.counselUserProgramRepository.save(counselUserProgram);
        }

        // 코치 자동 배정 및 체널을 등록한다.
        await this.assignmentMainCoach(user, foundUserProgram);

        // 시작(목표설정) 터치베이스 등록
        // 최초 구독으로 설정된 경우 사전설문, 증상체크를 할 수 있도록 한다.
        await this.usersService.startUserTouchBase(user, foundUserProgram.startDate, true);

        // 구독 전환 시 default mission-asis 생성
        await this.usersService.createDefaultMission(userProgram);
    }*/
    /*

    async userEndSubscriptionByAdmin(user: User) {
        // 사용자 프로그램을 조회한다.
        let foundUserProgramList;
        switch (user.oldSubscriptionType) {
            case CommonConstants.SUBSCRIPTION_TYPE_CANCELED:
                foundUserProgramList = await this.userProgramRepository.find({
                    where: { userId: user.userId, status: CommonConstants.USER_PROGRAM_STATUS_CANCELED },
                });

                for (const userProgram of foundUserProgramList) {
                    // 사용자 프로그램을 유지로 변경한다.
                    userProgram.status = CommonConstants.USER_PROGRAM_STATUS_MAINTAIN;
                    // 프로그램 종료일은 오늘날짜로 종료 시킨다.
                    userProgram.endDate = moment(new Date()).format(CommonConstants.DATE_FORMAT);
                    // ~~[DIET-2074] 프로그램의 종료일은 하루 전 날짜로 종료시킨다.~~ 잠시 대기
                    // userProgram.endDate = moment(new Date()).subtract(1, 'day').format(CommonConstants.DATE_FORMAT);
                    userProgram.updateDate = new Date();
                    await this.userProgramRepository.save(userProgram);
                }

                break;
            default:
                foundUserProgramList = await this.userProgramRepository.find({ where: { userId: user.userId, status: CommonConstants.USER_PROGRAM_STATUS_RUNNING } });
                for (const userProgram of foundUserProgramList) {
                    // 사용자 프로그램을 유지로 변경한다.
                    userProgram.status = CommonConstants.USER_PROGRAM_STATUS_MAINTAIN;
                    // 프로그램 종료일은 오늘날짜로 종료 시킨다.
                    userProgram.endDate = moment(new Date()).format(CommonConstants.DATE_FORMAT);
                    userProgram.updateDate = new Date();

                    // 이어하기 시 상담 주차를 재등록하기 위한, 종료일 이후 주차는 모두 삭제한다.
                    await this.deleteCounselUserProgramAfterEndDateByAdmin(userProgram);

                    await this.userProgramRepository.save(userProgram);
                }
                break;
        }

        // 사용자 설문 상태 정보를 초기화 한다
        user.preSurveyType = CommonConstants.PRESURVEY_TYPE_NONE;
        user.symptomSurveyType = CommonConstants.SYMPTOM_SURVEY_TYPE_NONE;
        await this.userRepository.save(user);
    }
*/

    async userProgramAllStopByAdmin(user: User) {
        // 사용자 진행 프로그램을 조회한다.
        const foundUserProgramList = await this.userProgramRepository.find({
            where: { userId: user.userId, status: In([CommonConstants.USER_PROGRAM_STATUS_RUNNING, CommonConstants.USER_PROGRAM_STATUS_MAINTAIN]) },
        });

        for (const userProgram of foundUserProgramList) {
            // 유지 사용자 프로그램 종료한다.
            userProgram.status = CommonConstants.USER_PROGRAM_STATUS_STOP;
            userProgram.endDate = moment(new Date()).format(CommonConstants.DATE_FORMAT);
            userProgram.updateDate = new Date();

            if (userProgram.status === CommonConstants.USER_PROGRAM_STATUS_RUNNING) {
                // 이어하기 시 상담 주차를 재등록하기 위한, 종료일 이후 주차는 모두 삭제한다.
                await this.deleteCounselUserProgramAfterEndDateByAdmin(userProgram);
            }

            // 진행중인 사전 설문을 삭제한다.
            //await this.surveyService.deleteUserSurvey(user.userId, userProgram.userProgramId);

            await this.userProgramRepository.save(userProgram);
        }

        // 사용자 설문 상태 정보를 초기화 한다
        user.preSurveyType = CommonConstants.PRESURVEY_TYPE_NONE;
        user.symptomSurveyType = CommonConstants.SYMPTOM_SURVEY_TYPE_NONE;
        await this.userRepository.save(user);
    }

    async userProgramStopByAdmin(userProgram: UserProgram) {
        // 유지 사용자 프로그램 종료한다.
        userProgram.status = CommonConstants.USER_PROGRAM_STATUS_STOP;
        userProgram.updateDate = new Date();

        await this.userProgramRepository.save(userProgram);
    }

    async deleteCounselUserProgramAfterEndDateByAdmin(userProgram: UserProgram) {
        // 종료일 기준으로 해당 주차를 조회한다.
        const queryBuilder = this.counselUserProgramRepository.createQueryBuilder();
        queryBuilder.where(`userId = ${userProgram.userId}`);
        queryBuilder.andWhere(`userProgramId = ${userProgram.userProgramId}`);
        queryBuilder.andWhere(`weeklyStartDate <= '${userProgram.endDate}'`);
        queryBuilder.andWhere(`weeklyEndDate >= '${userProgram.endDate}'`);

        const foundCounselUserProgram = await queryBuilder.getOne();

        if (Boolean(foundCounselUserProgram)) {
            // 해당 주차 이후 정보를 삭제한다.
            await this.counselUserProgramRepository
                .createQueryBuilder()
                .delete()
                .where(`userId = ${userProgram.userId}`)
                .andWhere(`userProgramId = ${userProgram.userProgramId}`)
                .andWhere(`weekly > ${foundCounselUserProgram.weekly}`)
                .execute();
        }
    }

    async userProgramAllCanceledByAdmin(user: User) {
        // 1. 해당 유저의 userProgram 상태가 '진행 대기 (W)' ,'사용자 시작 대기(U)' 인 데이터 조회
        const foundUserProgramListInStatusWait = await this.userProgramRepository.find({
            where: { status: In([CommonConstants.USER_PROGRAM_STATUS_USER_START_WAIT, CommonConstants.USER_PROGRAM_STATUS_WAIT]), userId: user.userId },
        });

        // 2. 대기 중인 상태가 있으면 먼저 결제 취소를 완료 해야함
        if (foundUserProgramListInStatusWait.length > 0) {
            throw new HttpException(
                {
                    statusCode: HttpStatus.BAD_REQUEST,
                    message: '예약된 멤버십을 먼저 결제 취소하신 후 전체 구독을 취소하실 수 있습니다',
                },
                HttpStatus.BAD_REQUEST,
            );
        }

        // 3. '진행중 (R)'인 상태의 최근 userProgram 1건 조회
        const getCurrentUserProgram = await this.userProgramRepository.findOne({
            where: {
                status: In([CommonConstants.USER_PROGRAM_STATUS_RUNNING, CommonConstants.USER_PROGRAM_STATUS_CONTINUOUS]),
                userId: user.userId,
            },
            order: {
                startDate: CommonConstants.TYPEORM_SORT_ORDER_DESCENDING,
            },
        });

        // 4. 진행중인 UserProgram이 있으면 취소 절차 시작
        if (getCurrentUserProgram) {
            // 해당 UserProgram과 매핑된 subscriptionTag 조회
            const currentSubscriptionTag = await this.subscriptionTagService.getSubscriptionTagById(getCurrentUserProgram.subscriptionTagId);

            // 구독 관련 약관 동의 로그 삭제.
            // 프로그램에 연관된 약관 세트 ID 로 약관 매핑 정보를 조회합니다.
            // 없는 경우 B2C 약관 조회
            const termsOfServiceMappings = currentSubscriptionTag?.termsOfServiceSetId
                ? await this.termsOfServiceProvider.getTermsOfServiceBySetId(currentSubscriptionTag.termsOfServiceSetId)
                : await this.termsOfServiceProvider.getTermsOfServiceBySetTypeAndSetId(TermsOfServiceConstants.setType.B2C);

            // 약관 매핑 정보를 있을때만 삭제
            if (termsOfServiceMappings) {
                // 조회된 약관 매핑 정보에서 약관 ID들을 추출합니다.
                const termsOfServiceIds = termsOfServiceMappings.termsOfServices.map((terms) => terms.termsOfServiceId);

                // 약관 IDs + 해당 구독 태그 ID로 삭제
                await this.termsOfServiceLoggerProvider.deleteLogByInTermsOfServiceIdAndSubscriptionTagId(user.userId, termsOfServiceIds, currentSubscriptionTag.subscriptionTagId);
            }
        }

        // 5. 해당 유저의 '진행중 (R)'인 userProgram 전체 조회
        const foundUserProgramList = await this.userProgramRepository.find({ where: { status: In([CommonConstants.USER_PROGRAM_STATUS_RUNNING]), userId: user.userId } });

        // 6. '취소 (C)'로 userProgram 상태 변경
        for (const userProgram of foundUserProgramList) {
            userProgram.status = CommonConstants.USER_PROGRAM_STATUS_CANCELED;
            if (!userProgram.startDate) userProgram.startDate = moment(new Date()).format(CommonConstants.DATE_FORMAT);
            userProgram.endDate = moment(new Date()).format(CommonConstants.DATE_FORMAT);
            userProgram.updateDate = new Date();

            await this.deleteCounselUserProgramAfterEndDateByAdmin(userProgram);

            await this.userProgramRepository.save(userProgram);

            // 진행중인 사전 설문기록을 초기화 한다.
            await this.surveyService.deleteUserSurvey(user.userId, userProgram.userProgramId);
        }

        // 사용자 설문 상태 정보를 초기화 한다
        user.preSurveyType = CommonConstants.PRESURVEY_TYPE_NONE;
        user.symptomSurveyType = CommonConstants.SYMPTOM_SURVEY_TYPE_NONE;

        // 사용자 터치베이스 상태를 초기화 한다.
        user.touchBaseType = null;
        user.touchBaseDate = null;
        await this.userRepository.save(user);
    }

    // TODO: 주문 및 결제기능 추가에 따라 추후 삭제 예정
    /**
     * 사용자 프로그램 취소
     * @param user
     */
    async userProgramAllCanceledByAdminV1(user: User) {
        // 사용자 진행 프로그램을 조회한다.
        const foundUserProgramList = await this.userProgramRepository.find({
            where: { status: In([CommonConstants.USER_PROGRAM_STATUS_RUNNING, CommonConstants.USER_PROGRAM_STATUS_USER_START_WAIT, CommonConstants.USER_PROGRAM_STATUS_WAIT]), userId: user.userId },
        });

        // 사용자 진행 프로그램 가장 최근것 만가져옴
        const getCurrentUserProgram = await this.userProgramRepository.findOne({
            where: {
                status: In([
                    CommonConstants.USER_PROGRAM_STATUS_RUNNING,
                    CommonConstants.USER_PROGRAM_STATUS_USER_START_WAIT,
                    CommonConstants.USER_PROGRAM_STATUS_WAIT,
                    CommonConstants.USER_PROGRAM_STATUS_CONTINUOUS,
                ]),
                userId: user.userId,
            },
            order: {
                startDate: CommonConstants.TYPEORM_SORT_ORDER_DESCENDING,
            },
        });

        if (getCurrentUserProgram) {
            const currentProgramCode = await this.programCodeRepository.findOne({ where: { programCode: getCurrentUserProgram.programCode }, relations: ['subscriptionTag'] });

            // 구독 관련 약관 동의 로그 삭제.
            // 프로그램에 연관된 약관 세트 ID 로 약관 매핑 정보를 조회합니다.
            // 없는 경우 B2C 약관 조회
            const termsOfServiceMappings = currentProgramCode?.subscriptionTag?.termsOfServiceSetId
                ? await this.termsOfServiceProvider.getTermsOfServiceBySetId(currentProgramCode.subscriptionTag.termsOfServiceSetId)
                : await this.termsOfServiceProvider.getTermsOfServiceBySetTypeAndSetId(TermsOfServiceConstants.setType.B2C);

            // 약관 매핑 정보를 있을때만 삭제
            if (termsOfServiceMappings) {
                // 조회된 약관 매핑 정보에서 약관 ID들을 추출합니다.
                const termsOfServiceIds = termsOfServiceMappings.termsOfServices.map((terms) => terms.termsOfServiceId);

                // 약관 IDs + 해당 구독 태그 ID로 삭제
                await this.termsOfServiceLoggerProvider.deleteLogByInTermsOfServiceIdAndSubscriptionTagId(user.userId, termsOfServiceIds, currentProgramCode.subscriptionTagId);
            }
        }

        for (const userProgram of foundUserProgramList) {
            userProgram.status = CommonConstants.USER_PROGRAM_STATUS_CANCELED;
            if (!userProgram.startDate) userProgram.startDate = moment(new Date()).format(CommonConstants.DATE_FORMAT);
            userProgram.endDate = moment(new Date()).format(CommonConstants.DATE_FORMAT);
            userProgram.updateDate = new Date();

            await this.deleteCounselUserProgramAfterEndDateByAdmin(userProgram);

            await this.userProgramRepository.save(userProgram);

            const foundProgramCode = await this.programCodeRepository.findOne({ where: { programCode: userProgram.programCode }, relations: ['subscriptionTag'] });
            if (!foundProgramCode) {
                continue;
            }

            foundProgramCode.status = CommonConstants.PROGRAM_CODE_STATUS_REMOVED;
            foundProgramCode.updateDate = new Date();

            await this.programCodeRepository.save(foundProgramCode);

            // 진행중인 사전 설문기록을 초기화 한다.
            await this.surveyService.deleteUserSurvey(user.userId, userProgram.userProgramId);

            // 구독 결제 관리에서 해당 사용자 정보를 변경한다.
            await this.subscriptionService.updateCanceledSubscriptionByProgramCode(foundProgramCode);
        }

        // 사용자 설문 상태 정보를 초기화 한다
        user.preSurveyType = CommonConstants.PRESURVEY_TYPE_NONE;
        user.symptomSurveyType = CommonConstants.SYMPTOM_SURVEY_TYPE_NONE;

        // 사용자 터치베이스 상태를 초기화 한다.
        user.touchBaseType = null;
        user.touchBaseDate = null;
        await this.userRepository.save(user);
    }

    /* -------------------------------
    * 사용자 APP : 구독 관리 페이지용
    --------------------------------*/
    async getUserSubscriptionList(userId: number, today: string) {
        const subscriptions = await this.userProgramRepository
            .createQueryBuilder('subscription')
            .where('subscription.userId = :userId', { userId })
            .orderBy(
                `CASE 
                    WHEN subscription.startDate <= :today AND subscription.finishDate >= :today THEN 1 
                    WHEN subscription.startDate > :today THEN 2 
                    ELSE 3 
                  END`,
                'ASC',
            )
            .addOrderBy('subscription.finishDate', 'ASC')
            .setParameters({ today })
            .getMany();

        return subscriptions;
        // return await this.userProgramRepository.find({ where: { userId: searchRequestDto.filterOption.userId }, order: { finishDate: CommonConstants.TYPEORM_SORT_ORDER_ASCENDING } });
    }

    // TODO: 결제 이후 사용 안할예정
    @Transactional()
    async registryUserSubscriptionCodeV2(userProgramModelDto: UserProgramModelDto) {
        const user = await this.usersService.getUser({ userId: userProgramModelDto.userId });
        const current = moment().tz(user.appUseTimezone);
        const { membershipStatus } = await this.membershipProvider.getUserMembership(user.userId);

        // 인증코드를 조회하여, 사용자에게 발급된 코드인지 확인한다.
        const programCode = await this.programCodeService.findOneByProgramCode(userProgramModelDto, user);

        // 시작일보다 과거라면
        if (current.isBefore(programCode.startDate, 'day')) {
            const daysUntilStart = DateUtils.getMoment(programCode.startDate).diff(current, 'days');
            const formatted = DateUtils.getMoment(programCode.startDate).format('M월 D일');

            throw new HttpException(
                {
                    statusCode: HttpStatus.UNAUTHORIZED,
                    message: `구독일까지 ${daysUntilStart + 1}일차 남았어요.<br/> ${formatted}에 구독 코드를 다시 입력해 주세요`,
                    code: 'PS028',
                },
                HttpStatus.BAD_REQUEST,
            );
        }

        // 인증 코드가 있으면 사용 완료 처리
        await this.programCodeService.useProgramCode(programCode, user.userId, programCode?.receiverPhone !== user.phone ? user.phone : null);

        /*
        // 시작일이 있는 인증코드일 경우
        if (Boolean(programCode.startDate)) {
            const startDate = DateUtils.getMoment(programCode.startDate).format('YYYY-MM-DD');

            // 오늘 날짜가 구독 코드 시작 날짜보다 이전이라면 대기 프로그램을 등록한다.
            if (current.isBefore(startDate, 'day') || current.isBefore(startDate, 'month')) {
                await this.waitUserProgramHelperService.createWaitUserProgramIfExistProgramCodeStartDate(user, programCode);
                // 취소 상태일 경우 사전 설문, 증상체크 초기화
                if (membershipStatus === MembershipConstants.status.Canceled) {
                    user.preSurveyType = CommonConstants.PRESURVEY_TYPE_NONE;
                    user.symptomSurveyType = CommonConstants.SYMPTOM_SURVEY_TYPE_NONE;
                    user.updateDate = new Date();

                    await this.userRepository.save(user);
                }

                const userWeldaMetaData = await this.usersService.findOneUserWeldaMetaDataByUserId(user.userId);
                if (!(userWeldaMetaData && userWeldaMetaData?.dayZeroStartDate) || (userWeldaMetaData && userWeldaMetaData.dayZeroEndDate)) {
                    // 0일차 신규 코드 등록일 때 0일차 메타데이터 등록
                    await this.usersService.createUserWeldaMetaData({ userId: user.userId, dayZeroStartDate: DateUtils.getMoment().format('YYYY-MM-DD') });
                }

                return;
            }
        }*/

        switch (membershipStatus) {
            case MembershipConstants.status.Paid:
                throw new HttpException(
                    {
                        statusCode: HttpStatus.UNAUTHORIZED,
                        message: `현재 구독중인 상태라 추가 코드 입력이 불가합니다.`,
                        code: 'PS028',
                    },
                    HttpStatus.BAD_REQUEST,
                );

            // // 구독 상태라면 대기 프로그램을 하나 만들어주고 끝낸다.
            // const runningUserProgram = await this.userProgramService.getUserProgramByUser(user);
            // await this.waitUserProgramHelperService.createWaitUserProgramWhenUserIsSubscriptionStatus(user, programCode, runningUserProgram);
            //
            // break;

            case MembershipConstants.status.Expiration:
                const foundMaintainUserProgram = await this.userProgramService.getUserProgramByUser(user);

                // 사용자 구독 태그 정보를 설정한다.
                user.subscriptionTagId = programCode.subscriptionTagId;
                user.subscriptionTagName = programCode.subscriptionTagName;

                // 종료일을 확인하여, 168시간이 이상 지난 경우 어어서하기가 진행될 수 없도록 한다.
                const endDate = moment(foundMaintainUserProgram.endDate).add(1, 'day').format(CommonConstants.DATE_FORMAT);
                const diffDays = Math.floor(moment.duration(current.diff(endDate)).asHours());
                // NOTE: 168시간 이내 (변화 유지)
                if (diffDays <= 168) {
                    // 연속 구독 프로그램을 만들어준다.
                    const newUserProgram = await this.waitUserProgramHelperService.createContinuousUserProgramV1(user, programCode, foundMaintainUserProgram);

                    // 연속 구독이 1일 이상 차이가 있을 경우
                    // NOTE: 2025-08-04 부터는 immediate는 예약이 활성화 되는 구독만으로 변경한다. (기존: 1일 이내 구독 전환)
                    await this.membershipProvider.createUserMembership(user.userId, MembershipConstants.status.Paid, MembershipConstants.detailStatus.ContinuousDelayed);

                    await this.sendbirdSystemMessage(user, SystemMessageConstants.MESSAGE_TYPE_MAINTAIN, foundMaintainUserProgram);

                    await this.continuousRunProgram(user, foundMaintainUserProgram, newUserProgram);

                    const coachGroup = await this.coachGroupRepository.findOne({ where: { userProgramId: foundMaintainUserProgram.userProgramId } });

                    await this.slackService.assignmentCoachForCoach(coachGroup.name, user.name, user.nickName, user.subscriptionTagName);
                } else {
                    // 연속 구독이 아닐 경우
                    const userProgram = await this.waitUserProgramHelperService.createWaitUserProgramByNotContinuousV1(user, programCode, false);

                    // 연속 구독이 아닐 경우 코치 배정
                    const newCoachGroup = await this.assignmentMainCoach(user, userProgram, LoggerDescriptionConstants.AssignmentWhenStatus.RENEWAL_PENDING);

                    await this.membershipProvider.createUserMembership(user.userId, MembershipConstants.status.Paid, MembershipConstants.detailStatus.RenewalPending);

                    await this.slackService.assignmentCoachForAdmin(newCoachGroup.name, user.name, user.nickName, user.subscriptionTagName, 'R');
                }

                // 사용자의 웰다 메타데이터 없을 경우 생성
                if (!user?.userWeldaMetaData) {
                    await this.usersService.createUserWeldaMetaDataZeroDayDone(user.userId);
                }

                await this.userRepository.save(user);

                break;
            case MembershipConstants.status.Canceled: {
                const { membershipDetailStatus } = await this.membershipProvider.getLastNonCanceledStatus(user.userId);
                const userWeldaMetaData = await this.usersService.findOneUserWeldaMetaDataByUserId(user.userId);

                user.preSurveyType = CommonConstants.PRESURVEY_TYPE_NONE;
                user.symptomSurveyType = CommonConstants.SYMPTOM_SURVEY_TYPE_NONE;
                user.updateDate = new Date();
                // user.subscriptionType = CommonConstants.SUBSCRIPTION_TYPE_FREE;

                await this.userRepository.save(user);

                // 0일차에서 취소된 경우
                if (membershipDetailStatus === MembershipConstants.detailStatus.InitialPending) {
                    // 0일차 신규 코드 등록일 때 0일차 메타데이터 등록
                    userWeldaMetaData.dayZeroStartDate = DateUtils.getMoment().format('YYYY-MM-DD');
                    userWeldaMetaData.dayZeroEndDate = null;

                    await this.usersService.updateUserWeldaMetaData(userWeldaMetaData.userWeldaMetaDataId, userWeldaMetaData);

                    const newUserProgram = await this.waitUserProgramHelperService.createWaitUserProgramByNotContinuousV1(user, programCode, true);

                    await this.sendbirdSystemMessage(user, SystemMessageConstants.MESSAGE_TYPE_ZERO_DAY, newUserProgram);

                    // 0일차 신규 코드 등록일 때 코치 배정
                    const newCoachGroup = await this.assignmentMainCoach(user, newUserProgram, LoggerDescriptionConstants.AssignmentWhenStatus.INITIAL_PENDING);

                    await this.membershipProvider.createUserMembership(user.userId, MembershipConstants.status.Paid, MembershipConstants.detailStatus.InitialPending);

                    await this.slackService.assignmentCoachForAdmin(newCoachGroup.name, user.name, user.nickName, newUserProgram.subscriptionTagName, 'F');
                } else {
                    // 연속 구독이 아닐 경우
                    const newUserProgram = await this.waitUserProgramHelperService.createWaitUserProgramByNotContinuousV1(user, programCode, false);

                    // 재구독 일때 코치 배정
                    const newCoachGroup = await this.assignmentMainCoach(user, newUserProgram, LoggerDescriptionConstants.AssignmentWhenStatus.RENEWAL_PENDING);

                    await this.membershipProvider.createUserMembership(user.userId, MembershipConstants.status.Paid, MembershipConstants.detailStatus.RenewalPending);

                    await this.slackService.assignmentCoachForAdmin(newCoachGroup.name, user.name, user.nickName, newUserProgram.subscriptionTagName, 'R');

                    // 사용자의 웰다 메타데이터 없을 경우 생성
                    if (!user?.userWeldaMetaData) {
                        await this.usersService.createUserWeldaMetaDataZeroDayDone(user.userId);
                    }
                }
                break;
            }
            // 신규 구독일 경우
            default:
                const newUserProgram = await this.waitUserProgramHelperService.createWaitUserProgramByNotContinuousV1(user, programCode, true);

                const userWeldaMetaData = await this.usersService.findOneUserWeldaMetaDataByUserId(user.userId);
                if (!userWeldaMetaData && !userWeldaMetaData?.dayZeroStartDate) {
                    // 0일차 신규 코드 등록일 때 0일차 메타데이터 등록
                    await this.usersService.createUserWeldaMetaData({ userId: user.userId, dayZeroStartDate: DateUtils.getMoment().format('YYYY-MM-DD') });
                }

                // 0일차 신규 코드 등록일 때 코치 배정
                const newCoachGroup = await this.assignmentMainCoach(user, newUserProgram, LoggerDescriptionConstants.AssignmentWhenStatus.INITIAL_PENDING);

                await this.sendbirdSystemMessage(user, SystemMessageConstants.MESSAGE_TYPE_ZERO_DAY, newUserProgram);

                await this.membershipProvider.createUserMembership(user.userId, MembershipConstants.status.Paid, MembershipConstants.detailStatus.InitialPending);

                await this.slackService.assignmentCoachForAdmin(newCoachGroup.name, user.name, user.nickName, newUserProgram.subscriptionTagName, 'F');

                break;
        }
    }

    /**
     * 사용자 구독 대기 중인 정보 조회
     * @param user
     */
    async getUserPendingPaidMembership(user: { userId: number; name: string; nickName: string; phone: string; email: string }): Promise<IActivatePaidMembership> {
        const foundPreScreening = await this.preScreeningHistoryProvider.getPreScreeningHistoryByUserId(user.userId);

        const preScreeningResult =
            foundPreScreening === null
                ? null // 조회된 사전 스크리닝이 없으면 Null
                : Boolean(foundPreScreening.isSuccess)
                ? UserLoggerConstants.AFTER_MEMBERSHIP_STEP.PRE_SCREENING_SUCCESS // 있는데 성공이면 SUCCESS
                : UserLoggerConstants.AFTER_MEMBERSHIP_STEP.PRE_SCREENING_FAIL; // 있는데 실패이면 FAIL

        // 자동승인 or 수동 승인 완료 된 파트너 코드 정보 조회 (바로 구독 대기 활성화 가능)
        const approvedJoinRequest = await this.organizationProvider.getApprovedJoinRequestByUserId(user.userId);
        if (approvedJoinRequest) {
            const subscriptionTagInfo = await this.subscriptionTagService.getSubscriptionTagById(approvedJoinRequest.subscriptionTagId);

            return {
                organizationJoinRequestId: approvedJoinRequest.organizationJoinRequestId,
                organizationJoinRequestStatus: approvedJoinRequest.status,
                orderId: null,
                needActivate: true, // true인 경우 절차 완료 시 구독 대기 활성화 요청 보내야 함
                preScreeningResult, // 최근 사전 스크리닝 결과 (null: 없음, PRE_SCREENING_SUCCESS: 성공, PRE_SCREENING_FAIL: 실패)
                subscription: {
                    subscriptionTagId: subscriptionTagInfo.subscriptionTagId,
                    subscriptionTagName: subscriptionTagInfo.name,
                    subscriptionTagTerm: subscriptionTagInfo.term,
                },
            };
        }
        // 수동 승인 대기중인 파트너 코드 정보 조회 (바로 구독대기 활성화 불가능 - 초기 진입시 페이지 분기처리 위함)
        // 수동 승인 대기중인 파트너 코드의 경우 구독 대기 활성화 요청을 보내지 않음
        const pendingJoinRequest = await this.organizationProvider.getPendingJoinRequestByUserId(user.userId);

        if (pendingJoinRequest) {
            // 수동 승인은 파트너코드에 속한 구독태그가 아닌 구독태그를 선택하여 해당 구독태그 정보로 세팅
            const subscriptionTag = await this.subscriptionTagService.getSubscriptionTagById(pendingJoinRequest.subscriptionTagId);

            if (!subscriptionTag) {
                throw new HttpException(
                    {
                        statusCode: HttpStatus.BAD_REQUEST,
                        message: '파트너 코드에 매핑된 구독 태그가 없습니다.',
                    },
                    HttpStatus.BAD_REQUEST,
                );
            }
            return {
                organizationJoinRequestId: pendingJoinRequest.organizationJoinRequestId,
                organizationJoinRequestStatus: pendingJoinRequest.status,
                orderId: null,
                needActivate: false, // false인 경우 구독 대기 활성화 요청을 보내면 안됨
                preScreeningResult, // 최근 사전 스크리닝 결과 (null: 없음, PRE_SCREENING_SUCCESS: 성공, PRE_SCREENING_FAIL: 실패)
                subscription: {
                    subscriptionTagId: subscriptionTag.subscriptionTagId,
                    subscriptionTagName: subscriptionTag.name,
                    subscriptionTagTerm: subscriptionTag.term,
                },
            };
        }
        const order = await this.orderProvider.findOneOrderByUserPhoneAndName(user.phone, user.name);

        if (order) {
            return {
                organizationJoinRequestId: null,
                orderId: order.orderId,
                isGuestOrder: !!order.isGuestOrder,
                isGiftOrder: !!order.isGiftOrder,
                needActivate: true, // 결제 완료 및 선물 받기의 경우 구독권 대기 활성화 요청 필요함
                preScreeningResult, // 최근 사전 스크리닝 결과 (null: 없음, PRE_SCREENING_SUCCESS: 성공, PRE_SCREENING_FAIL: 실패)
                subscription: {
                    subscriptionTagId: order.subscriptionTagId,
                    subscriptionTagName: order.subscriptionTagName,
                    subscriptionTagTerm: order.subscriptionTagTerm,
                },
            };
        }

        // 조직 가입 요청도 없고, 주문 정보도 없는 경우
        throw new UnprocessableEntityException('사용자 구독 대기 정보가 없습니다.');
    }

    /**
     * 사용자 프로그램을 우선순위에 따라 정렬
     * @param userPrograms
     */
    private sortUserProgramsByPriority(userPrograms: UserProgram[]): UserProgram[] {
        // Running이 없으면 -> 정렬 후 하나만 U, 나머지는 W
        return userPrograms.sort((a, b) => {
            // 1순위 : 파트너 코드가 있는 경우
            const partnerA = a.organizationJoinRequestId ? 1 : 0;
            const partnerB = b.organizationJoinRequestId ? 1 : 0;
            if (partnerA !== partnerB) return partnerB - partnerA;

            // 2순위 : 배송지 입력 일시, 주문 일시, 주문 생성일시 기준으로 오래된 순
            const dateA = a.order?.deliveryAddressEnteredAt || a.order?.orderAt || a.createDate;
            const dateB = b.order?.deliveryAddressEnteredAt || b.order?.orderAt || b.createDate;
            if (dateA.getTime() !== dateB.getTime()) {
                return dateA.getTime() - dateB.getTime();
            }

            // 3순위 : userProgramId 오름 차순
            return a.userProgramId - b.userProgramId;
        });
    }

    /**
     * 주어진 두 개의 UserProgram 간 모든 컬럼 데이터를 서로 맞바꿔 우선순위를 변경하는 메서드
     * @param prevUserProgram : 우선순위 1순위에서 밀린 userProgram
     * @param nextUserProgram : 우선순위 1순위로 선택된 userProgram
     */
    private swapUserPrograms(prevUserProgram: UserProgram, nextUserProgram: UserProgram): UserProgram[] {
        const { userProgramId: prevUserProgramId, ...prevUserProgramData } = prevUserProgram;
        const { userProgramId: nextUserProgramId, ...nextUserProgramData } = nextUserProgram;

        // prevUserProgram에 nextUserProgram 데이터 할당
        Object.assign(prevUserProgram, nextUserProgramData, {
            status: CommonConstants.USER_PROGRAM_STATUS_USER_START_WAIT, // 1순위 이므로 U로 저장
            startDate: null,
            endDate: null,
            finishDate: null,
            order: undefined, // 저장 전 연결된 order 객체 끊어줌 (스왑된 orderId 저장됨)
            updateDate: new Date(),
        });

        // nextUserProgram에 prevUserProgram 데이터 할당
        Object.assign(nextUserProgram, prevUserProgramData, {
            status: CommonConstants.USER_PROGRAM_STATUS_WAIT, // 1순위에서 밀렸으므로 W로 저장
            startDate: null,
            endDate: null,
            finishDate: null,
            order: undefined, // 저장 전 연결된 order 객체 끊어줌 (스왑된 orderId 저장됨)
            updateDate: new Date(),
        });

        this.logger.log(`swapUserPrograms - swapped prevUserProgramId=${prevUserProgram.userProgramId}, nextUserProgramId=${nextUserProgram.userProgramId}`);

        return [prevUserProgram, nextUserProgram];
    }

    /**
     * userProgram 상태를 우선순위에 따라 동기화한다.
     * @param user
     */
    async synchronizeUserProgramStatusByPriority(user: User) {
        // 1. Running 상태 조회
        const runningProgram = await this.userProgramRepository.findOne({
            where: { userId: user.userId, status: CommonConstants.USER_PROGRAM_STATUS_RUNNING },
        });

        // 2. U, W 상태 전체 조회
        const userPrograms = await this.userProgramRepository.find({
            where: {
                userId: user.userId,
                status: In([CommonConstants.USER_PROGRAM_STATUS_WAIT, CommonConstants.USER_PROGRAM_STATUS_USER_START_WAIT]),
            },
            relations: ['order'],
        });

        // 상태 업데이트가 필요한 userProgram 저장할 리스트
        const needUpdateUserPrograms: UserProgram[] = [];
        if (runningProgram) {
            // Running이 있으면 -> 전부 W로 변경
            userPrograms.forEach((userProgram) => {
                if (userProgram.status !== CommonConstants.USER_PROGRAM_STATUS_WAIT) {
                    Object.assign(userProgram, {
                        status: CommonConstants.USER_PROGRAM_STATUS_WAIT,
                        startDate: null,
                        endDate: null,
                        finishDate: null,
                        updateDate: new Date(),
                    });
                    needUpdateUserPrograms.push(userProgram);
                }
            });
        } else {
            // 유료 상태에서 U, W 상태인 유저프로그램이 1개도 없는 경우 에러 반환
            if (userPrograms.length === 0) {
                throw new Error('UserProgram이 없습니다.');
            }

            // U 상태를 갖는 기존의 userProgram
            const prevUserProgram = userPrograms.find((up) => up.status === CommonConstants.USER_PROGRAM_STATUS_USER_START_WAIT);

            if (userPrograms.length === 1 && prevUserProgram) {
                // 최신으로 업데이트 된 구독 태그를 우선순위가 가장 높은 구독 태그로 변경
                user.preSurveyType = CommonConstants.PRESURVEY_TYPE_NONE;
                user.symptomSurveyType = CommonConstants.SYMPTOM_SURVEY_TYPE_NONE;
                user.updateDate = new Date();
                await this.userRepository.save(user);
                return;
            }

            const sortedUserPrograms = this.sortUserProgramsByPriority(userPrograms);

            // 가장 우선순위가 높은 userProgram (U 상태를 가질 userProgram)
            const topUserProgram = ArrayUtil.arrayToSingleObjectFirst(sortedUserPrograms);

            // U,W 상태의 userProgram이 2개 이상일 경우 우선순위 가장 높은 userProgram의 구독 태그 정보를 user에 저장
            user.subscriptionTagId = topUserProgram.subscriptionTagId;
            user.subscriptionTagName = topUserProgram.subscriptionTagName;
            user.subscriptionUpdateDate = new Date();
            user.updateDate = new Date();
            await this.userRepository.save(user);

            // 두개의 userProgramId가 다를 경우 스왑 필요 (1순위의 userProgram과 기존의 U 상태인 userProgram의 정보를 바꿔줘야 함)
            if (prevUserProgram && prevUserProgram.userProgramId !== topUserProgram.userProgramId) {
                // 우선순위에 의해 userProgram간 swap 수행
                const swappedUserPrograms = await this.swapUserPrograms(prevUserProgram, topUserProgram);

                needUpdateUserPrograms.push(...swappedUserPrograms);
            }

            // swap을 제외한 나머지 U,W 상태의 userProgram W로 변경
            sortedUserPrograms.forEach((userProgram, idx) => {
                if (needUpdateUserPrograms.includes(userProgram)) return; // swap 진행된 유저 프로그램 제외

                const nextStatus = idx === 0 ? CommonConstants.USER_PROGRAM_STATUS_USER_START_WAIT : CommonConstants.USER_PROGRAM_STATUS_WAIT;

                const needUpdate = userProgram.status !== nextStatus;

                if (needUpdate) {
                    userProgram.status = nextStatus;
                    userProgram.startDate = null;
                    userProgram.endDate = null;
                    userProgram.finishDate = null;
                    userProgram.updateDate = new Date();
                    needUpdateUserPrograms.push(userProgram);
                }
            });
        }

        // 업데이트가 필요한 userProgram이 있다면 저장
        if (needUpdateUserPrograms.length > 0) {
            await this.userProgramRepository.save(needUpdateUserPrograms);

            // 업데이트된 기록 로그 출력
            const changedLogs = needUpdateUserPrograms.map((p) => ({
                userProgramId: p.userProgramId,
                status: p.status,
                startDate: p.startDate,
                endDate: p.endDate,
                finishDate: p.finishDate,
            }));

            if (changedLogs.length > 0) {
                this.logger.log(`[program.service > synchronizedUserProgramStatusByPriority] userId=${user.userId}, changed:\n${JSON.stringify(changedLogs, null, 2)}`);
            }
        }
    }

    /**
     * 무료 사용자 구독자로 전환 (0일차로 전환)
     * @param phone
     * @param userName
     */
    @Transactional()
    async activatePaidMembership(phone: string, userName: string) {
        const user = await this.usersService.getUserByPhoneAndName(phone, userName);
        if (!user) {
            throw new NotFoundException(`사용자를 찾을 수 없습니다`);
        }
        const current = moment().tz(user.appUseTimezone);

        const userMembershipExcludingOnboarding = await this.membershipProvider.getUserMembershipWithoutOnboarding(user.userId);

        // 멤버십 상태가 Free 상태인지 확인
        const isFreeMembership = userMembershipExcludingOnboarding.membershipStatus === MembershipConstants.status.Free;

        const userActivatePaidMembershipInfo: IActivatePaidMembership = await this.getUserPendingPaidMembership(user);

        if (!userActivatePaidMembershipInfo || !userActivatePaidMembershipInfo.needActivate) {
            throw new BadRequestException('사용자 구독 대기 활성화 할 수 있는 구독권이 없습니다.');
        }

        const preScreeningResult = userActivatePaidMembershipInfo.preScreeningResult;
        const partnerApprovalStatus = userActivatePaidMembershipInfo.organizationJoinRequestStatus;

        /**
         * NOTE: Free 유저의 경우 구독 경로에 따라 사전 스크리닝의 필수 여부가 다름
         * isFreeMembership : 무료 유저 여부
         * partnerApprovalStatus : 파트너 코드 승인 상태 (파트너 코드인 경우 Pending, Reject이면 불가) but, 주문/결제 구독권인 경우 NULL
         * preScreeningResult : 사전 스크리닝 결과 (Null: 미실시, SUCCESS: 성공, FAIL: 실패)
         */
        if (isFreeMembership) {
            // 파트너 코드 입력 유형이 아닌 경우 (플랜 결제 선물 유형)
            if (!userActivatePaidMembershipInfo.organizationJoinRequestId) {
                // 플랜 결제/선물 && 사전스크리닝 미실시
                if (preScreeningResult === null) {
                    throw new UnprocessableEntityException(`사용자 온보딩이 필요합니다. 온보딩을 완료해주세요.`);
                }

                // 플랜 결제/선물 && 사전스크리닝 실패
                if (preScreeningResult === UserLoggerConstants.AFTER_MEMBERSHIP_STEP.PRE_SCREENING_FAIL) {
                    throw new UnprocessableEntityException(`사전 스크리닝 실패로 진행이 불가합니다.`);
                }
            } else {
                // 자동 승인 파트너 코드인 경우
                if (partnerApprovalStatus === OrganizationConstants.JoinRequestStatus.AUTO) {
                    // 자동 승인 파트너 코드 && 사전 스크리닝 미실시
                    if (preScreeningResult === null) {
                        throw new UnprocessableEntityException(`사용자 온보딩이 필요합니다. 온보딩을 완료해주세요.`);
                    }
                    // 자동 승인 파트너 코드 && 사전 스크리닝 실패
                    if (preScreeningResult === UserLoggerConstants.AFTER_MEMBERSHIP_STEP.PRE_SCREENING_FAIL) {
                        throw new UnprocessableEntityException(`사전 스크리닝 실패로 진행이 불가합니다.`);
                    }
                    // 수동 승인 파트너 코드인 경우
                } else if (partnerApprovalStatus === OrganizationConstants.JoinRequestStatus.PENDING) {
                    // 수동 승인 파트너 코드 승인 대기중 && 사전 스크리닝 미실시
                    if (preScreeningResult === null) {
                        throw new UnprocessableEntityException(`사용자 온보딩이 필요합니다. 온보딩을 완료해주세요.`);
                    }
                    // 수동 승인 파트너 코드 대기중 && 사전 스크리닝 성공 혹은 실패
                    throw new UnprocessableEntityException(`파트너 코드 승인 대기중입니다.`);

                    // 수동 승인 파트너 코드 승인 완료
                } else if (partnerApprovalStatus === OrganizationConstants.JoinRequestStatus.APPROVED) {
                    // 수동 승인 파트너 코드 승인 완료 && 사전 스크리닝 미실시
                    if (preScreeningResult == null) {
                        throw new UnprocessableEntityException(`사전 스크리닝 완료 후에 수동 승인 파트너 코드 진행이 가능합니다.`);
                    }
                } else {
                    // 취소/거절/기타 상태는 차단
                    throw new UnprocessableEntityException('파트너 코드 활성화가 불가능한 상태입니다.');
                }
            }
        }

        switch (userMembershipExcludingOnboarding.membershipStatus) {
            // 유료일 경우
            case MembershipConstants.status.Paid: {
                // 사용자 구독 태그 정보를 현재에 맞게 설정하지 않는다. => 현재 구독중인 태그를 바라봐야 함
                // user.subscriptionTagId = userActivatePaidMembershipInfo.subscription.subscriptionTagId;
                // user.subscriptionTagName = userActivatePaidMembershipInfo.subscription.subscriptionTagName;

                const userProgram = await this.userProgramService.getUserProgramByUser(user);

                // 0일차일 경우 (구독 시작 대기 중일 경우에는 우선순위에 따라 활성화 시킬 구독권이 바뀔 수 있음)
                if (userProgram.status === CommonConstants.USER_PROGRAM_STATUS_USER_START_WAIT) {
                    await this.waitUserProgramHelperService.createWaitUserProgramByNotContinuous(user, userActivatePaidMembershipInfo, false);
                    // 여러개의 status가 U인 데이터가 있으면 안되기 때문에 프로그램 우선순위에 따라 status를 U 또는 W로 변경한다.
                    await this.synchronizeUserProgramStatusByPriority(user);

                    // 이전에 Paid 상태였던 적이 있는 경우 현재 Free 상태여도 Paid 조건문으로 들어고 있음 (위에서 Free, SubscriptionOnboarding을 제외하고 조회하기 떄문)
                    // 수동 승인 파트너 코드의 경우 approval 후에도 Free,OnboardingSubscriptionPending으로 남아있으므로, activate 시 Paid로 변경
                    await this.membershipProvider.createUserMembership(user.userId, MembershipConstants.status.Paid, MembershipConstants.detailStatus.InitialPending);
                } else {
                    // 구독이 진행 중인 경우에 들어온 구독권은 Wait 상태로 저장
                    await this.waitUserProgramHelperService.createWaitUserProgramWhenPaidUser(user, userActivatePaidMembershipInfo);
                }

                // 사용자의 웰다 메타데이터 없을 경우 생성
                if (!user?.userWeldaMetaData) {
                    await this.usersService.createUserWeldaMetaDataZeroDayDone(user.userId);
                }

                await this.userRepository.save(user);
                break;
            }
            case MembershipConstants.status.Expiration: {
                const foundMaintainUserProgram = await this.userProgramService.getUserProgramByUser(user);

                // 사용자 구독 태그 정보를 설정한다.
                user.subscriptionTagId = userActivatePaidMembershipInfo.subscription.subscriptionTagId;
                user.subscriptionTagName = userActivatePaidMembershipInfo.subscription.subscriptionTagName;
                user.subscriptionUpdateDate = new Date();
                // 종료일을 확인하여, 168시간이 이상 지난 경우 어어서하기가 진행될 수 없도록 한다.
                const endDate = moment(foundMaintainUserProgram.endDate).add(1, 'day').format(CommonConstants.DATE_FORMAT);
                const diffDays = Math.floor(moment.duration(current.diff(endDate)).asHours());
                // NOTE: 168시간 이내 (변화 유지)
                if (diffDays <= 168) {
                    // 연속 구독 프로그램을 만들어준다.
                    const newUserProgram = await this.waitUserProgramHelperService.createContinuousUserProgram(user, userActivatePaidMembershipInfo, foundMaintainUserProgram);

                    if (newUserProgram.startDate === endDate) {
                        await this.membershipProvider.createUserMembership(user.userId, MembershipConstants.status.Paid, MembershipConstants.detailStatus.ContinuousImmediate);
                    } else {
                        // 연속 구독이 1일 이상 차이가 있을 경우
                        await this.membershipProvider.createUserMembership(user.userId, MembershipConstants.status.Paid, MembershipConstants.detailStatus.ContinuousDelayed);
                    }

                    await this.sendbirdSystemMessage(user, SystemMessageConstants.MESSAGE_TYPE_MAINTAIN, foundMaintainUserProgram);

                    await this.continuousRunProgram(user, foundMaintainUserProgram, newUserProgram);

                    const coachGroup = await this.coachGroupRepository.findOne({ where: { userProgramId: foundMaintainUserProgram.userProgramId } });

                    await this.slackService.assignmentCoachForCoach(coachGroup.name, user.name, user.nickName, user.subscriptionTagName);
                } else {
                    // 연속 구독이 아닐 경우
                    const userProgram = await this.waitUserProgramHelperService.createWaitUserProgramByNotContinuous(user, userActivatePaidMembershipInfo, false);

                    // 연속 구독이 아닐 경우 코치 배정
                    const newCoachGroup = await this.assignmentMainCoach(user, userProgram, LoggerDescriptionConstants.AssignmentWhenStatus.RENEWAL_PENDING);

                    await this.membershipProvider.createUserMembership(user.userId, MembershipConstants.status.Paid, MembershipConstants.detailStatus.RenewalPending);

                    await this.slackService.assignmentCoachForAdmin(newCoachGroup.name, user.name, user.nickName, user.subscriptionTagName, 'R');

                    user.preSurveyType = CommonConstants.PRESURVEY_TYPE_NONE;
                    user.symptomSurveyType = CommonConstants.SYMPTOM_SURVEY_TYPE_NONE;
                    user.updateDate = new Date();
                }

                // 사용자의 웰다 메타데이터 없을 경우 생성
                if (!user?.userWeldaMetaData) {
                    await this.usersService.createUserWeldaMetaDataZeroDayDone(user.userId);
                }

                await this.userRepository.save(user);
                break;
            }
            case MembershipConstants.status.Canceled: {
                const latestMembership = await this.membershipProvider.getLastNonCanceledStatus(user.userId);

                const latestMembershipDetailStatus = latestMembership.membershipDetailStatus;

                const userWeldaMetaData = await this.usersService.findOneUserWeldaMetaDataByUserId(user.userId);

                user.preSurveyType = CommonConstants.PRESURVEY_TYPE_NONE;
                user.symptomSurveyType = CommonConstants.SYMPTOM_SURVEY_TYPE_NONE;
                user.updateDate = new Date();
                // 사용자 구독 태그 정보를 설정한다.
                user.subscriptionTagId = userActivatePaidMembershipInfo.subscription.subscriptionTagId;
                user.subscriptionTagName = userActivatePaidMembershipInfo.subscription.subscriptionTagName;
                user.subscriptionUpdateDate = new Date();
                // user.subscriptionType = CommonConstants.SUBSCRIPTION_TYPE_FREE;

                await this.userRepository.save(user);

                // 0일차에서 취소된 경우
                if (latestMembershipDetailStatus === MembershipConstants.detailStatus.InitialPending) {
                    // 0일차 신규 코드 등록일 때 0일차 메타데이터 등록
                    userWeldaMetaData.dayZeroStartDate = DateUtils.getMoment().format('YYYY-MM-DD');
                    userWeldaMetaData.dayZeroEndDate = null;

                    await this.usersService.updateUserWeldaMetaData(userWeldaMetaData.userWeldaMetaDataId, userWeldaMetaData);

                    const newUserProgram = await this.waitUserProgramHelperService.createWaitUserProgramByNotContinuous(user, userActivatePaidMembershipInfo, true);

                    await this.sendbirdSystemMessage(user, SystemMessageConstants.MESSAGE_TYPE_ZERO_DAY, newUserProgram);

                    // 0일차 신규 코드 등록일 때 코치 배정
                    const newCoachGroup = await this.assignmentMainCoach(user, newUserProgram, LoggerDescriptionConstants.AssignmentWhenStatus.INITIAL_PENDING);

                    await this.membershipProvider.createUserMembership(user.userId, MembershipConstants.status.Paid, MembershipConstants.detailStatus.InitialPending);

                    await this.slackService.assignmentCoachForAdmin(newCoachGroup.name, user.name, user.nickName, newUserProgram.subscriptionTagName, 'F');
                } else {
                    // 연속 구독이 아닐 경우
                    const newUserProgram = await this.waitUserProgramHelperService.createWaitUserProgramByNotContinuous(user, userActivatePaidMembershipInfo, false);

                    // 재구독 일때 코치 배정
                    const newCoachGroup = await this.assignmentMainCoach(user, newUserProgram, LoggerDescriptionConstants.AssignmentWhenStatus.RENEWAL_PENDING);

                    await this.membershipProvider.createUserMembership(user.userId, MembershipConstants.status.Paid, MembershipConstants.detailStatus.RenewalPending);

                    await this.slackService.assignmentCoachForAdmin(newCoachGroup.name, user.name, user.nickName, newUserProgram.subscriptionTagName, 'R');

                    // 사용자의 웰다 메타데이터 없을 경우 생성
                    if (!user?.userWeldaMetaData) {
                        await this.usersService.createUserWeldaMetaDataZeroDayDone(user.userId);
                    }
                }
                break;
            }
            // 신규 구독일 경우
            default: {
                const newUserProgram = await this.waitUserProgramHelperService.createWaitUserProgramByNotContinuous(user, userActivatePaidMembershipInfo, true);

                const userWeldaMetaData = await this.usersService.findOneUserWeldaMetaDataByUserId(user.userId);

                if (!userWeldaMetaData && !userWeldaMetaData?.dayZeroStartDate) {
                    // 0일차 신규 코드 등록일 때 0일차 메타데이터 등록
                    await this.usersService.createUserWeldaMetaData({
                        userId: user.userId,
                        dayZeroStartDate: DateUtils.getMoment().format('YYYY-MM-DD'),
                    });
                }

                // 0일차 신규 코드 등록일 때 코치 배정
                const newCoachGroup = await this.assignmentMainCoach(user, newUserProgram, LoggerDescriptionConstants.AssignmentWhenStatus.INITIAL_PENDING);

                await this.sendbirdSystemMessage(user, SystemMessageConstants.MESSAGE_TYPE_ZERO_DAY, newUserProgram);

                await this.membershipProvider.createUserMembership(user.userId, MembershipConstants.status.Paid, MembershipConstants.detailStatus.InitialPending);

                await this.slackService.assignmentCoachForAdmin(newCoachGroup.name, user.name, user.nickName, newUserProgram.subscriptionTagName, 'F');

                // 사용자 구독 태그 정보를 설정한다
                await this.userRepository.update(user.userId, {
                    subscriptionTagId: userActivatePaidMembershipInfo.subscription.subscriptionTagId,
                    subscriptionTagName: userActivatePaidMembershipInfo.subscription.subscriptionTagName,
                    updateDate: new Date(),
                    subscriptionUpdateDate: new Date(),
                });

                break;
            }
        }

        return userActivatePaidMembershipInfo;
    }

    /**
     * 사용자 구독 시작
     * @param userProgramUserStartDto
     */
    @Transactional()
    async startUserSubscription(userProgramUserStartDto: UserProgramUserStartDto) {
        const foundUser = await this.usersService.getUser({ userId: userProgramUserStartDto.userId });

        const foundUserProgram = await this.userProgramRepository.findOne({
            where: { userProgramId: userProgramUserStartDto.userProgramId, userId: userProgramUserStartDto.userId, status: CommonConstants.USER_PROGRAM_STATUS_USER_START_WAIT },
        });

        if (!foundUserProgram) {
            throw new HttpException(
                {
                    statusCode: HttpStatus.BAD_REQUEST,
                    message: '사용자 프로그램을 찾을 수 없습니다.',
                    code: 'PS009',
                },
                HttpStatus.BAD_REQUEST,
            );
        }

        // 인증코드를 조회한다.
        const foundProgramCode = await this.programCodeRepository.findOne({ where: { programCode: foundUserProgram.programCode } });

        const startDate = moment(new Date()).tz(CommonConstants.KOREA_TIMEZONE);
        // endDate - 1 << 시작일을 포함하여 처리하기 때문임
        const endDate = startDate.clone().add((foundUserProgram.subscriptionTagTerm || foundProgramCode.term) - 1, 'days');

        foundUserProgram.status = CommonConstants.USER_PROGRAM_STATUS_RUNNING;
        foundUserProgram.startDate = startDate.format(CommonConstants.DATE_FORMAT);
        foundUserProgram.endDate = endDate.format(CommonConstants.DATE_FORMAT);
        foundUserProgram.finishDate = endDate.format(CommonConstants.DATE_FORMAT);
        foundUserProgram.updateDate = new Date();

        const newUserProgram = await this.userProgramRepository.save(foundUserProgram);

        // 상담 사용자 프로그램을 생성한다.
        const weekStartDate = startDate.clone();
        const weekEndDate = weekStartDate.clone().add('6', 'days');

        // 전체 주차
        const weelkyCount = Math.floor(moment.duration(endDate.diff(startDate)).asWeeks()) + 1;

        // 신규 추가될 주차
        let weelky = CommonConstants.PROGRAM_WEEKLY_FIRST;

        // TODO : 삭제 필요
        // 시작일을 기준으로 7일씩 4주를 나누어 counselUserProgram 에 등록한다.
        while (weelky <= weelkyCount) {
            const counselUserProgram = new CounselUserProgram();
            counselUserProgram.userProgramId = foundUserProgram.userProgramId;
            counselUserProgram.userId = foundUserProgram.userId;
            counselUserProgram.weekly = weelky++;
            counselUserProgram.weeklyStartDate = weekStartDate.format(CommonConstants.DATE_FORMAT);
            counselUserProgram.weeklyEndDate = weekEndDate.format(CommonConstants.DATE_FORMAT);

            weekStartDate.add('7', 'days');
            weekEndDate.add('7', 'days');

            // counselUserProgram 에 등록한다.
            await this.counselUserProgramRepository.save(counselUserProgram);
        }

        // 사용자 구독 태그 정보를 설정한다.
        foundUser.subscriptionTagId = foundUserProgram.subscriptionTagId ?? foundProgramCode.subscriptionTagId;

        // 코치 자동 배정 및 체널을 등록한다.
        // await this.assignmentMainCoach(foundUser, foundUserProgram, startDate.clone());

        // 구독 시작 클릭시 생성해주는 1주차 미션 생성
        await this.missionProvider.createStartMission(foundUser, foundUserProgram, true);

        // 유저의 zeroEndDate가 비어있다면 금일 날짜로 추가해준다. 0 일차 유저
        if (foundUser.userWeldaMetaData && !foundUser.userWeldaMetaData.dayZeroEndDate) {
            foundUser.userWeldaMetaData.dayZeroEndDate = DateUtils.getMoment().format('YYYY-MM-DD');

            await this.sendbirdSystemMessage(foundUser, SystemMessageConstants.MESSAGE_TYPE_FIRST_SUBSCRIPTION, foundUserProgram);
            await this.usersService.updateUserWeldaMetaData(foundUser.userWeldaMetaData.userWeldaMetaDataId, foundUser.userWeldaMetaData);
        } else {
            await this.sendbirdSystemMessage(foundUser, SystemMessageConstants.MESSAGE_TYPE_RE_SUBSCRIPTION, foundUserProgram);
        }

        // 다음 멤버십 상태 조회
        const nextMembership = await this.membershipProvider.getNextMembershipStatus(foundUser.userId);

        // 목표 설정 터치베이스
        const userTouchBaseLogger = await this.usersService.startUserTouchBase(foundUser, foundUserProgram.startDate, true);
        // 멤버십 변경
        await this.membershipProvider.createUserMembership(foundUser.userId, nextMembership.membershipStatus, nextMembership.membershipDetailStatus);

        // 코치 그룹 조회
        const coachGroup = await this.coachGroupRepository.findOne({ where: { userProgramId: foundUserProgram.userProgramId } });

        // 코치에게 코치 배정 Slack Message 전송
        await this.slackService.assignmentCoachForCoach(coachGroup.name, foundUser.name, foundUser.nickName, foundUserProgram.subscriptionTagName);

        // 코치 슬랙 터치베이스 알림
        await this.userProgramService.sendCoachingAlertWithSlack(foundUser, foundUserProgram, true, userTouchBaseLogger);

        // 추가로 시작 대기 상태인 프로그램이 있다면, 연속 구독 프로그램으로 처리한다.
        const additionalUserProgram = await this.userProgramRepository.find({
            where: { userId: foundUser.userId, status: CommonConstants.USER_PROGRAM_STATUS_USER_START_WAIT },
        });

        if (additionalUserProgram) {
            for (const userProgram of additionalUserProgram) {
                await this.continuousRunProgram(foundUser, newUserProgram, userProgram, true);
            }
        }
    }

    async continuousRunProgram(user: User, userProgram: UserProgram, newUserProgram: UserProgram, isRunningProgram = false) {
        // 현재 진행 중인 상담 프로그램의 마지막 주차를 조회한다.
        const foundLastWeeklyCounselUserProgram = await this.counselUserProgramRepository.findOne({
            where: { userId: userProgram.userId, userProgramId: userProgram.userProgramId },
            relations: { userProgram: true },
            order: { weekly: CommonConstants.TYPEORM_SORT_ORDER_DESCENDING },
        });

        // 사용자 상담 프로그램의 마지막 주차가 조회되지 않은 경우, 사용자 시작 대기로 변경한다.
        if (!foundLastWeeklyCounselUserProgram) {
            newUserProgram.status = CommonConstants.USER_PROGRAM_STATUS_USER_START_WAIT;
            newUserProgram.joinPreviousId = null;
            newUserProgram.completedOrientationYN = CommonConstants.USE_NO;
            await this.userProgramRepository.save(newUserProgram);
            return;
        }

        const current = moment(new Date()).tz(CommonConstants.KOREA_TIMEZONE);

        // 종료일을 확정한다.
        // endDate - 1 << 시작일을 포함하여 처리하기 때문임
        const endDate = current.clone().add(newUserProgram.subscriptionTagTerm - 1, 'days');

        // 사용자 프로그램을 업데이트.
        // 프로그램 코드를 업데이트 하지 않는다.
        //userProgram.programCode = userProgramModelDto.programCode;
        userProgram.status = CommonConstants.USER_PROGRAM_STATUS_RUNNING;
        userProgram.continueCount++;
        userProgram.endDate = endDate.format(CommonConstants.DATE_FORMAT);
        // 오늘 부터 이전 마지막 날짜까지 유예날 정함 하루 더해줘야함.
        // TODO: 하나의 값이 더 추가로 되어야함 기획과 논의 필요
        userProgram.retentionPeriodCount += DateUtils.calculateDaysExcludingEndpoints(foundLastWeeklyCounselUserProgram.userProgram.endDate, current.clone().format('YYYY-MM-DD')) + 2;
        userProgram.updateDate = new Date();
        await this.userProgramRepository.save(userProgram);

        const startDate = moment(userProgram.startDate, CommonConstants.DATE_FORMAT);

        // 상담 사용자 프로그램을 생성한다.
        const weekStartDate = moment(foundLastWeeklyCounselUserProgram.weeklyEndDate, CommonConstants.DATE_FORMAT).add(1, 'day');
        const weekEndDate = weekStartDate.clone().add('6', 'days');

        // 전체 주차
        const weelkyCount = Math.floor(moment.duration(endDate.diff(startDate)).asWeeks()) + 1;

        // 신규 추가될 주차
        let weelky = foundLastWeeklyCounselUserProgram.weekly + 1;
        // 시작일을 기준으로 7일씩 4주를 나누어 counselUserProgram 에 등록한다.
        while (weelky <= weelkyCount) {
            const counselUserProgram = new CounselUserProgram();
            counselUserProgram.userProgramId = userProgram.userProgramId;
            counselUserProgram.userId = userProgram.userId;
            counselUserProgram.weekly = weelky++;
            counselUserProgram.weeklyStartDate = weekStartDate.format(CommonConstants.DATE_FORMAT);
            counselUserProgram.weeklyEndDate = weekEndDate.format(CommonConstants.DATE_FORMAT);

            weekStartDate.add('7', 'days');
            weekEndDate.add('7', 'days');

            // counselUserProgram 에 등록한다.
            await this.counselUserProgramRepository.save(counselUserProgram);
        }

        if (!isRunningProgram) {
            // 코치 자동 배정 및 체널을 등록한다.
            await this.assignmentMainCoach(user, userProgram, LoggerDescriptionConstants.AssignmentWhenStatus.CONTINUOUS_IMMEDIATE);

            // 시작(목표 점검) 터치베이스 등록
            // 연속 구독인 경우 사전설문, 증상체크를 하지 않는다.
            const userTouchBaseLogger = await this.usersService.startUserTouchBase(user, current.format(CommonConstants.DATE_FORMAT), false);

            // 코치 슬랙 터치베이스 알림
            await this.userProgramService.sendCoachingAlertWithSlack(user, userProgram, false, userTouchBaseLogger);

            // 168시간 이내 구독 시작 시 미션 생성 (시작하기)
            await this.missionProvider.createStartMission(user, userProgram, false);
        }
    }

    /**
     * 사용자 구독 로그 리스트 조회
     * @param searchRequestDto
     */
    async getUserSubscriptionLogList(searchRequestDto: SearchRequestDto) {
        const queryBuilder = this.userProgramRepository.createQueryBuilder('up');
        queryBuilder.where('up.userId = :userId', { userId: searchRequestDto.filterOption.userId });
        queryBuilder.orderBy('up.createDate', CommonConstants.TYPEORM_SORT_ORDER_DESCENDING);

        SearchUtil.setOffset(searchRequestDto);

        queryBuilder.limit(searchRequestDto.windowSize);
        queryBuilder.offset(searchRequestDto.offset);

        searchRequestDto.totalCount = await queryBuilder.getCount();
        SearchUtil.setLastPages(searchRequestDto);

        const subscriptionLogList = await queryBuilder.disableEscaping().getMany();
        return subscriptionLogList.map((subscriptionLog) => {
            subscriptionLog.endDate = subscriptionLog.finishDate;
            return subscriptionLog;
        });
    }

    /**
     * 메인 코치 자동 배정 및 체널을 등록한다.
     * @param user
     * @param userProgram
     */
    async assignmentMainCoach(user: User, userProgram: UserProgram, loggerDescription: DescriptionAssignmentCoachWhenType) {
        // 메인 코치를 찾는다.
        const foundMainCoach = await this.findMainCoach(user.userId, userProgram);

        // 프로그램 담당 코치 정보를 조회한다.
        const queryBuilder = this.coachGroupRepository.createQueryBuilder('cg');
        queryBuilder.innerJoinAndSelect('cg.user', 'u');
        queryBuilder.where(`cg.userProgramId = ${userProgram.userProgramId}`);

        const foundMainCoachGroup = await queryBuilder.getOne();

        // 연속 구독의 경우 코치를 유지할 수 있는 상태인지 확인한다.
        if (userProgram.continueCount > 0) {
            if (foundMainCoachGroup) {
                const coachingRate = (foundMainCoachGroup.user.coachingUserCount / foundMainCoachGroup.user.coachCapacity) * 100;

                // 코칭 배정율이 100% 미만인 경우 코치를 새로 배정하지 않고 return 하여 기존 코치를 유지한다.
                if (coachingRate < 100) {
                    // 코치 배정 로거 추가
                    await this.userLoggerProvider.saveOneWeldaUserLoggerWithUser(
                        user.userId,
                        UserLoggerConstants.CHANGE_TYPE.NO_ACTION,
                        UserLoggerConstants.WELDA.ASSIGNMENT_COACH,
                        foundMainCoachGroup,
                        null,
                        UserLoggerConstants.OPERATOR_TYPE.USER,
                        null,
                        LoggerDescriptionConstants.AssignmentWhenStatus.CONTINUOUS_IMMEDIATE_NO_ACTION,
                    );

                    return foundMainCoachGroup;
                }
            }
        }
        const ChannelInfo = await this.userChannelRepository.findOne({ where: { user: { userId: user.userId } }, relations: { user: true, channel: true } });
        if (!ChannelInfo?.channel) {
            throw new HttpException(
                {
                    statusCode: HttpStatus.BAD_REQUEST,
                    message: '코치 배정에 실패하였습니다.',
                    code: 'PS025',
                },
                HttpStatus.BAD_REQUEST,
            );
        }
        let returnCoachGroup: CoachGroup;

        // 기존 코치가 없는 경우 코치 정보를 등록한다.
        if (!foundMainCoachGroup) {
            // 메인 코치 등록
            const mainCoach = new CoachGroup();
            mainCoach.userId = foundMainCoach.userId;
            mainCoach.name = foundMainCoach.name;
            mainCoach.memberUserId = userProgram.userId;
            mainCoach.userProgramId = userProgram.userProgramId;
            returnCoachGroup = await this.coachGroupRepository.save(mainCoach);

            const newUserChannel = new UserChannel();
            newUserChannel.user = foundMainCoach;
            newUserChannel.channel = ChannelInfo.channel;

            await this.userChannelRepository.save(newUserChannel);

            await this.usersService.syncSendbirdUserChannel(user.userId);
        } else {
            await this.coachGroupRepository.update({ userProgramId: userProgram.userProgramId }, { userId: foundMainCoach.userId, name: foundMainCoach.name, updateDate: new Date() });

            returnCoachGroup = await this.coachGroupRepository.findOne({ where: { userProgramId: userProgram.userProgramId } });

            await this.usersService.syncSendbirdUserChannel(user.userId);
        }

        // 코치 배정 로거 추가
        await this.userLoggerProvider.saveOneWeldaUserLoggerWithUser(
            user.userId,
            !foundMainCoachGroup ? UserLoggerConstants.CHANGE_TYPE.CREATE : UserLoggerConstants.CHANGE_TYPE.UPDATE,
            UserLoggerConstants.WELDA.ASSIGNMENT_COACH,
            !foundMainCoachGroup
                ? null
                : {
                      foundMainCoachGroup,
                      coachingRate: ((foundMainCoachGroup?.user?.coachingUserCount ?? 0) / (foundMainCoachGroup?.user?.coachCapacity ?? 0)) * 100,
                      coachingUserCount: foundMainCoachGroup.user.coachingUserCount,
                      coachCapacity: foundMainCoachGroup.user.coachCapacity,
                  },
            returnCoachGroup,
            UserLoggerConstants.OPERATOR_TYPE.USER,
            null,
            loggerDescription,
        );

        return returnCoachGroup;
    }

    private async findMainCoach(userId: number, userProgram: UserProgram) {
        // 테스트 코치 계정 구독 태그인 경우 내부 테스트용 유저로 간주해 테스트 코치로 배정한다.
        if (CommonConstants.TEST_USER_TAG_ID_LIST.includes(userProgram.subscriptionTagId)) {
            const subQuery = this.userRepository.createQueryBuilder('subUser').select('subUser.userId', 'userId').addSelect("f_coachingRunningUserCount(subUser.userId, 'M')", 'coachingRunningCount');

            const queryBuilder = this.userRepository.createQueryBuilder('u');
            queryBuilder
                .select('u.userId', 'userId')
                .addSelect('u.name', 'name')
                .addSelect('u.coachCapacity', 'coachCapacity')
                .addSelect('coachingData.coachingRunningCount', 'coachingRunningCount')
                .addSelect('(coachingData.coachingRunningCount / u.coachCapacity) * 100', 'coachingRate')
                .addSelect("CASE WHEN u.loginId = 'weldamain' THEN 1 ELSE 0 END", 'isWeldaMain')
                .innerJoin(`(${subQuery.getQuery()})`, 'coachingData', 'coachingData.userId = u.userId')
                .where('u.userType = :userType', { userType: CommonConstants.USER_TYPE_COACH })
                .andWhere('u.coachType = :coachType', { coachType: CommonConstants.COACH_TYPE_HEAD })
                .andWhere('u.coachStatus = :coachStatus', { coachStatus: CommonConstants.COACH_STATUS_ACTIVITY })
                .andWhere('u.loginId = :loginId', { loginId: CommonConstants.TEST_USER_COACH_ID })
                .andWhere('((coachingData.coachingRunningCount / u.coachCapacity) * 100) < 100')
                // 서브쿼리에서 사용하는 파라미터들을 메인 쿼리에 추가합니다.
                .setParameters(subQuery.getParameters());

            const foundTestMainCoach = await queryBuilder.getRawOne();
            if (!foundTestMainCoach) {
                throw new HttpException(
                    {
                        statusCode: HttpStatus.BAD_REQUEST,
                        message: '코치 배정에 실패하였습니다.',
                        code: 'PS025',
                    },
                    HttpStatus.BAD_REQUEST,
                );
            }
            return foundTestMainCoach;
        }

        // 코치 상태 정보를 조회한다.
        const foundCoachList = await this.userRepository.query(CoachAssignmentQuery.searchCoachQuery);

        this.logger.log(`program.service> assignmentMainCoach> foundCoachList> ${JSON.stringify(foundCoachList)}`);

        // 배정할 코치가 Error send
        if (foundCoachList.length === 0) {
            try {
                await sendErrorToSlack(new Error(`코치 배정에 실패하였습니다. user: ${userId}, program: ${userProgram.userProgramId}`));
            } catch (e) {
                this.logger.error(e);
            }
        }

        return await this.usersService.getCoachUser({ userId: foundCoachList[0].userId });
    }

    /**
     * 프로그램 코드를 전송
     * @param programCodeSendModelDto
     */
    @Transactional()
    async sendProgramCode(programCodeSendModelDto: ProgramCodeSendModelDto) {
        const result = {
            succededCount: 0,
            failedCount: 0,
            totalCount: programCodeSendModelDto.recipients.length,
            failedList: [],
            createdNewCodeCount: 0,
        };

        const current = moment(new Date());

        if (Boolean(programCodeSendModelDto.startDate)) {
            const checkDate = moment(programCodeSendModelDto.startDate, CommonConstants.DATE_FORMAT);

            if (current.isAfter(checkDate, 'day')) {
                throw new HttpException(
                    {
                        statusCode: HttpStatus.BAD_REQUEST,
                        message: '시작일은 오늘 이후 날짜로 입력되어야 합니다.',
                        code: 'PCS001',
                    },
                    HttpStatus.BAD_REQUEST,
                );
            }
        }

        /**
         * https://www.notion.so/welda/1f9a4e07955b80188db2c76bc82279ec
         * 2025-05-21 정책변경으로 인해 로직 변경 (김제윤, 도주환, 이지연)
         * ASIS 발급대기인 코드 개수 체크해서 부족한 개수 생성해서 전송하는 로직
         * TOBE 전송 시 매번 생성하여, 생성한 코드 전송하는 로직
         */

        result.createdNewCodeCount = programCodeSendModelDto.recipients.length;

        const programCodeIssueModelDto = new ProgramCodeIssueModelDto();
        programCodeIssueModelDto.quantity = result.createdNewCodeCount;
        programCodeIssueModelDto.subscriptionTagId = programCodeSendModelDto.subscriptionTagId;

        if (Boolean(programCodeSendModelDto.startDate)) {
            programCodeIssueModelDto.startDate = programCodeSendModelDto.startDate;
        }

        // 구독코드 생성 후 프로그램 코드와 사용자 정보를 적용한다.
        const foundProgramCodeList = await this.createAndAssignIssueWaitProgramCode(programCodeIssueModelDto, programCodeSendModelDto);

        // 수신자에게 sendType에 맞게 promgramCode를 발송한다.
        if (programCodeSendModelDto.sendType === SendMessageConstants.sendType.ALIMTALK) {
            // 알림톡 request body 생성
            for (const programCode of foundProgramCodeList) {
                const alimtalkDto: AlimTalkSendMessageDTO = {
                    to: programCode.receiverPhone,
                    from: this.configService.get('SMS_SENDER_PHONE_NO'),
                    message: 'message',
                    templateCode: AlimTalkTemplate.ProgramCode.templateCode,
                    templateParams: {
                        '#{programCode}': programCode.programCode,
                        '#{userName}': programCode.receiverName,
                        '#{env}': process.env.NODE_ENV,
                        '#{code}': programCode.programCode,
                    },
                };

                const alimtalkRes = await this.alimtalkService.sendMessage(alimtalkDto);

                // 알림톡 발급 성공한 경우
                if (alimtalkRes.succeededCount === 1) {
                    // 발급한 상태로 변경한다.
                    programCode.status = CommonConstants.PROGRAM_CODE_STATUS_ISSUED_DONE;
                    programCode.updateDate = new Date();
                    programCode.sentDate = new Date();
                    result.succededCount++;

                    // 전송 성공 기록을 남긴다.
                    console.log(`admin.service> sendProgramCode> alimtalk succeeded to send to receiver (${programCode.programCode} - ${programCode.receiverName} - ${programCode.receiverPhone}))`);

                    // 전송 결과를 구독 결제 관리에 기록한다.
                    await this.subscriptionService.updateSubscriptionByProgramCode(programCode);
                } else {
                    result.failedCount++;

                    result.failedList.push({
                        name: programCode.receiverName,
                        phone: programCode.receiverPhone,
                    });

                    // 전송 실패 기록을 남긴다.
                    console.error(`program.service> sendProgramCode> alimtalk failed to send to receiver (${programCode.programCode} - ${programCode.receiverName} - ${programCode.receiverPhone})`);

                    // 실패된 경우 데이터가 업데이트 되지 않도록 초기화 한다.
                    programCode.receiverName = null;
                    programCode.receiverPhone = null;
                }
            }
        } else {
            for (const programCode of foundProgramCodeList) {
                const body = await this.getProgramCodeMessageBody(programCodeSendModelDto, programCode);
                const sentResult = await this.smsProvider.sendProgramCodeMessage(programCodeSendModelDto, programCode.receiverPhone, body);
                // 성공한 경우에만 sentDate 에 시간을 기록한다.
                if (sentResult.data.code === 200) {
                    // 발급한 상태로 변경한다.
                    programCode.status = CommonConstants.PROGRAM_CODE_STATUS_ISSUED_DONE;
                    programCode.updateDate = new Date();
                    programCode.sentDate = new Date();
                    result.succededCount++;

                    // 전송 성공 기록을 남긴다.
                    console.log(`admin.service> sendProgramCode> succeeded to send to receiver(${programCode.programCode} - ${programCode.receiverName} - ${programCode.receiverPhone}))`);

                    // 전송 결과를 구독 결제 관리에 기록한다.
                    await this.subscriptionService.updateSubscriptionByProgramCode(programCode);
                } else {
                    result.failedCount++;

                    result.failedList.push({
                        name: programCode.receiverName,
                        phone: programCode.receiverPhone,
                    });

                    // 전송 실패 기록을 남긴다.
                    console.error(`program.service> sendProgramCode> failed to send to receiver(${programCode.programCode} - ${programCode.receiverName} - ${programCode.receiverPhone})`);

                    // 실패된 경우 데이터가 업데이트 되지 않도록 초기화 한다.
                    programCode.receiverName = null;
                    programCode.receiverPhone = null;
                }
            }
        }

        // 수정 정보를 업데이트 한다.
        await this.updateSentReulstProgramCode(foundProgramCodeList);

        /*
        // 전송 결과를 구독 결제 관리에 기록한다.
        for (const programCode of foundProgramCodeList) {
            if (programCode.status !== CommonConstants.PROGRAM_CODE_STATUS_ISSUED_DONE) {
                programCode.status = CommonConstants.PROGRAM_CODE_STATUS_SENT_FAILED;
            }

            await this.subscriptionService.updateSubscriptionByProgramCode(programCode);
        }
        */

        return result;
    }

    /**
     * 시스템 메시지 데이터를 생성한다.
     * @param user
     * @param usedVariables
     * @param userProgram
     */
    async generateSystemMessageData(user: User, usedVariables: string[], userProgram: UserProgram | null): Promise<Partial<ISendbirdSystemMessage>> {
        const messageData: Partial<ISendbirdSystemMessage> = {};
        const todayMoment = moment().tz(user.appUseTimezone);

        const getTotalWeight = await this.userProgramService.getWeight(user.userId, userProgram.userProgramId, userProgram.startDate, userProgram.endDate);
        const userPrograms = await this.userProgramService.getConnectedUserProgram(userProgram.userProgramId, todayMoment.format(CommonConstants.DATE_FORMAT));
        const getSubscriptionDays = Math.floor(userPrograms.reduce((acc, program) => acc + program.subscriptionTagTerm, 0) / 30);

        const before30Days = todayMoment.clone().subtract(30, 'days').format(CommonConstants.DATE_FORMAT);
        const get30DaysWeight = await this.userProgramService.getWeight(user.userId, userProgram.userProgramId, before30Days, todayMoment.format(CommonConstants.DATE_FORMAT));

        const dto = { filterOption: { userId: user.userId }, pageNo: 1, windowSize: 1 };

        let userSurveyAnswers: CoachSurveyAnswerListDto[] = [];
        if (usedVariables.length > 1) {
            const { data } = await this.surveyService.getUserPreSurvey(dto as SearchRequestDto);
            if (data) {
                userSurveyAnswers = data?.[0]?.list ?? [];
            }
        }

        // 예시로 각 변수를 임의로 가공하여 넣는 로직
        usedVariables.forEach((variable) => {
            switch (variable) {
                case '고객닉네임':
                    messageData.고객닉네임 = user.nickName;
                    break;
                case '웰다_목적':
                    messageData.웰다_목적 = userSurveyAnswers.find((e) => e.topicType === SystemMessageConstants.SURVEY_ID_WELDA_DECISION_REASON)?.answer ?? '-';
                    break;
                case 'N':
                    messageData.N = user.targetPantsSize;
                    break;
                case 'N_in':
                    messageData.N_in = Number((user.targetPantsSize / 2.54).toFixed(1)) * -1;
                    break;
                case 'M':
                    // 목표 감량 기간
                    messageData.M = userSurveyAnswers.find((e) => e.topicType === SystemMessageConstants.SURVEY_ID_DIET_PERIOD)?.answer ?? '-';
                    break;
                case '참여_기간':
                    messageData.참여_기간 = getSubscriptionDays ?? '';
                    break;
                case 'Nm': // 30일간 감량 수치
                    messageData.Nm = get30DaysWeight > 0 ? `+${get30DaysWeight}` : get30DaysWeight ?? '-';
                    break;
                case 'Nm_total': // 총 감량 수치
                    messageData.Nm_total = getTotalWeight > 0 ? `+${getTotalWeight}` : getTotalWeight ?? '-';
                    break;
                default:
                    break;
            }
        });

        return messageData;
    }

    /**
     * 시스템 메시지를 발송한다.
     * @param user
     * @param messageType
     * @param userProgram
     */
    async sendbirdSystemMessage(user: User, messageType: string, userProgram: UserProgram | null) {
        const getMessage = await this.systemMessageService.getMessageByMessageType(messageType);
        const { sendbirdUserId, channelUrl } = user;

        //['고객닉네임', '웰다_목적', 'N', 'N_in', 'M', '참여_기간', 'Nm', 'Nm_total'],
        for (const message of getMessage) {
            const { usedVariables } = message;

            const userData: Partial<ISendbirdSystemMessage> = await this.generateSystemMessageData(user, usedVariables, userProgram);

            const template = this.systemMessageService.generateSystemMessage(message.sendMessage, userData);

            await this.sendbirdService.sendAnnouncementImmediately(sendbirdUserId, channelUrl, template);
        }
    }

    /**
     * 프로그램 사용 완료인지 확인한다.
     * @param programCode
     */
    async checkUsedProgramCode(programCode: string) {
        return await this.programCodeRepository.findOne({ where: { programCode, status: Not(In([CommonConstants.PROGRAM_CODE_STATUS_ISSUED_DONE, CommonConstants.PROGRAM_CODE_STATUS_ISSUE_WAIT])) } });
    }

    @Transactional()
    async registryUserSubscriptionCodeForBulk(userProgramModelDto: UserProgramModelDto) {
        let current = DateUtils.getMoment();
        const user = await this.usersService.getUser({ userId: userProgramModelDto.userId });
        const { membershipStatus } = await this.membershipProvider.getUserMembership(user.userId);

        // 인증코드를 조회하여, 사용자에게 발급된 코드인지 확인한다.
        const programCode = await this.programCodeService.findOneByProgramCode(userProgramModelDto, user);

        // 인증 코드가 있으면 사용 완료 처리
        await this.programCodeService.useProgramCode(programCode, user.userId, programCode?.receiverPhone !== user.phone ? user.phone : null);

        current = moment(new Date()).tz(CommonConstants.KOREA_TIMEZONE).startOf('day');
        switch (membershipStatus) {
            case MembershipConstants.status.Paid:
                throw new HttpException(
                    {
                        statusCode: HttpStatus.UNAUTHORIZED,
                        message: `현재 구독중인 상태라 추가 코드 입력이 불가합니다.`,
                        code: 'PS028',
                    },
                    HttpStatus.BAD_REQUEST,
                );

            case MembershipConstants.status.Expiration:
                const foundMaintainUserProgram = await this.userProgramService.getUserProgramByUser(user);

                // 사용자 구독 태그 정보를 설정한다.
                user.subscriptionTagId = programCode.subscriptionTagId;
                user.subscriptionTagName = programCode.subscriptionTagName;

                // 종료일을 확인하여, 168시간이 이상 지난 경우 어어서하기가 진행될 수 없도록 한다.
                const endDate = moment(foundMaintainUserProgram.finishDate).add(1, 'day').format(CommonConstants.DATE_FORMAT);
                const diffDays = Math.floor(moment.duration(current.diff(endDate)).asHours());

                // NOTE: 168시간 이내 (변화 유지)
                if (diffDays <= 168) {
                    // 연속 구독 프로그램을 만들어준다.
                    const newUserProgram = await this.waitUserProgramHelperService.createContinuousUserProgramV1(user, programCode, foundMaintainUserProgram);

                    if (newUserProgram.startDate === endDate) {
                        await this.membershipProvider.createUserMembership(user.userId, MembershipConstants.status.Paid, MembershipConstants.detailStatus.ContinuousImmediate);
                    } else {
                        // 연속 구독이 1일 이상 차이가 있을 경우
                        await this.membershipProvider.createUserMembership(user.userId, MembershipConstants.status.Paid, MembershipConstants.detailStatus.ContinuousDelayed);
                    }

                    await this.sendbirdSystemMessage(user, SystemMessageConstants.MESSAGE_TYPE_MAINTAIN, foundMaintainUserProgram);

                    await this.continuousRunProgram(user, foundMaintainUserProgram, newUserProgram);
                } else {
                    // 연속 구독이 아닐 경우
                    const userProgram = await this.waitUserProgramHelperService.createWaitUserProgramByNotContinuousV1(user, programCode, false);

                    // 연속 구독이 아닐 경우 코치 배정
                    await this.assignmentMainCoach(user, userProgram, LoggerDescriptionConstants.AssignmentWhenStatus.RENEWAL_PENDING);

                    await this.membershipProvider.createUserMembership(user.userId, MembershipConstants.status.Paid, MembershipConstants.detailStatus.RenewalPending);
                }

                // 사용자의 웰다 메타데이터 없을 경우 생성
                if (!user?.userWeldaMetaData) {
                    await this.usersService.createUserWeldaMetaDataZeroDayDone(user.userId);
                }

                //await this.userRepository.save(user);

                break;
            case MembershipConstants.status.Canceled: {
                const { membershipDetailStatus } = await this.membershipProvider.getLastNonCanceledStatus(user.userId);
                const userWeldaMetaData = await this.usersService.findOneUserWeldaMetaDataByUserId(user.userId);

                user.preSurveyType = CommonConstants.PRESURVEY_TYPE_NONE;
                user.symptomSurveyType = CommonConstants.SYMPTOM_SURVEY_TYPE_NONE;
                user.updateDate = new Date();
                // user.subscriptionType = CommonConstants.SUBSCRIPTION_TYPE_FREE;

                await this.userRepository.save(user);

                // 0일차에서 취소된 경우
                if (membershipDetailStatus === MembershipConstants.detailStatus.InitialPending) {
                    // 0일차 신규 코드 등록일 때 0일차 메타데이터 등록
                    userWeldaMetaData.dayZeroStartDate = DateUtils.getMoment().format('YYYY-MM-DD');
                    userWeldaMetaData.dayZeroEndDate = null;

                    await this.usersService.updateUserWeldaMetaData(userWeldaMetaData.userWeldaMetaDataId, userWeldaMetaData);

                    const newUserProgram = await this.waitUserProgramHelperService.createWaitUserProgramByNotContinuousV1(user, programCode, true);

                    await this.sendbirdSystemMessage(user, SystemMessageConstants.MESSAGE_TYPE_ZERO_DAY, newUserProgram);

                    // 0일차 신규 코드 등록일 때 코치 배정
                    await this.assignmentMainCoach(user, newUserProgram, LoggerDescriptionConstants.AssignmentWhenStatus.INITIAL_PENDING);

                    await this.membershipProvider.createUserMembership(user.userId, MembershipConstants.status.Paid, MembershipConstants.detailStatus.InitialPending);
                } else {
                    // 연속 구독이 아닐 경우
                    const newUserProgram = await this.waitUserProgramHelperService.createWaitUserProgramByNotContinuousV1(user, programCode, false);

                    // 재구독 일때 코치 배정
                    await this.assignmentMainCoach(user, newUserProgram, LoggerDescriptionConstants.AssignmentWhenStatus.RENEWAL_PENDING);

                    await this.membershipProvider.createUserMembership(user.userId, MembershipConstants.status.Paid, MembershipConstants.detailStatus.RenewalPending);

                    // 사용자의 웰다 메타데이터 없을 경우 생성
                    if (!user?.userWeldaMetaData) {
                        await this.usersService.createUserWeldaMetaDataZeroDayDone(user.userId);
                    }
                }
                break;
            }
            // 신규 구독일 경우
            default:
                const newUserProgram = await this.waitUserProgramHelperService.createWaitUserProgramByNotContinuousV1(user, programCode, true);

                const userWeldaMetaData = await this.usersService.findOneUserWeldaMetaDataByUserId(user.userId);
                if (!userWeldaMetaData && !userWeldaMetaData?.dayZeroStartDate) {
                    // 0일차 신규 코드 등록일 때 0일차 메타데이터 등록
                    await this.usersService.createUserWeldaMetaData({ userId: user.userId, dayZeroStartDate: DateUtils.getMoment().format('YYYY-MM-DD') });
                }

                // 0일차 신규 코드 등록일 때 코치 배정
                await this.assignmentMainCoach(user, newUserProgram, LoggerDescriptionConstants.AssignmentWhenStatus.INITIAL_PENDING);

                await this.sendbirdSystemMessage(user, SystemMessageConstants.MESSAGE_TYPE_ZERO_DAY, newUserProgram);

                await this.membershipProvider.createUserMembership(user.userId, MembershipConstants.status.Paid, MembershipConstants.detailStatus.InitialPending);

                break;
        }
    }

    /**
     * 사용자 구독 시작
     * @param userProgramUserStartDto
     */
    @Transactional()
    async startUserSubscriptionForBulk(userProgramUserStartDto: UserProgramUserStartDto) {
        const foundUser = await this.usersService.getUser({ userId: userProgramUserStartDto.userId });

        const foundUserProgram = await this.userProgramRepository.findOne({ where: { userProgramId: userProgramUserStartDto.userProgramId, userId: userProgramUserStartDto.userId } });

        if (!foundUserProgram) {
            throw new HttpException(
                {
                    statusCode: HttpStatus.BAD_REQUEST,
                    message: '사용자 프로그램을 찾을 수 없습니다.',
                    code: 'PS009',
                },
                HttpStatus.BAD_REQUEST,
            );
        }

        // 시작 대기 상태인 경우만 처리한다.
        if (foundUserProgram.status !== CommonConstants.USER_PROGRAM_STATUS_USER_START_WAIT) {
            throw new HttpException(
                {
                    statusCode: HttpStatus.BAD_REQUEST,
                    message: '사용자 시작 대기 상태만 시작이 가능합니다.',
                    code: 'PS023',
                },
                HttpStatus.BAD_REQUEST,
            );
        }

        // 인증코드를 조회한다.
        const foundProgramCode = await this.programCodeRepository.findOne({ where: { programCode: foundUserProgram.programCode } });

        const startDate = moment(new Date()).tz(CommonConstants.KOREA_TIMEZONE);
        // endDate - 1 << 시작일을 포함하여 처리하기 때문임
        const endDate = startDate.clone().add(foundProgramCode.term - 1, 'days');
        foundUserProgram.status = CommonConstants.USER_PROGRAM_STATUS_RUNNING;
        foundUserProgram.startDate = startDate.format(CommonConstants.DATE_FORMAT);
        foundUserProgram.endDate = endDate.format(CommonConstants.DATE_FORMAT);
        foundUserProgram.finishDate = endDate.format(CommonConstants.DATE_FORMAT);
        foundUserProgram.updateDate = new Date();

        await this.userProgramRepository.save(foundUserProgram);

        // 상담 사용자 프로그램을 생성한다.
        const weekStartDate = startDate.clone();
        const weekEndDate = weekStartDate.clone().add('6', 'days');

        // 전체 주차
        const weelkyCount = Math.floor(moment.duration(endDate.diff(startDate)).asWeeks()) + 1;

        // 신규 추가될 주차
        let weelky = CommonConstants.PROGRAM_WEEKLY_FIRST;

        // TODO : 삭제 필요
        // 시작일을 기준으로 7일씩 4주를 나누어 counselUserProgram 에 등록한다.
        while (weelky <= weelkyCount) {
            const counselUserProgram = new CounselUserProgram();
            counselUserProgram.userProgramId = foundUserProgram.userProgramId;
            counselUserProgram.userId = foundUserProgram.userId;
            counselUserProgram.weekly = weelky++;
            counselUserProgram.weeklyStartDate = weekStartDate.format(CommonConstants.DATE_FORMAT);
            counselUserProgram.weeklyEndDate = weekEndDate.format(CommonConstants.DATE_FORMAT);

            weekStartDate.add('7', 'days');
            weekEndDate.add('7', 'days');

            // counselUserProgram 에 등록한다.
            await this.counselUserProgramRepository.save(counselUserProgram);
        }

        // 사용자 구독 태그 정보를 설정한다.
        foundUser.subscriptionTagId = foundProgramCode.subscriptionTagId;

        // 구독 시작 클릭시 생성해주는 1주차 미션 생성
        await this.missionProvider.createStartMission(foundUser, foundUserProgram, true);

        // 유저의 zeroEndDate가 비어있다면 금일 날짜로 추가해준다. 0 일차 유저
        if (foundUser.userWeldaMetaData && !foundUser.userWeldaMetaData.dayZeroEndDate) {
            foundUser.userWeldaMetaData.dayZeroEndDate = DateUtils.getMoment().format('YYYY-MM-DD');

            await this.sendbirdSystemMessage(foundUser, SystemMessageConstants.MESSAGE_TYPE_FIRST_SUBSCRIPTION, foundUserProgram);
            await this.usersService.updateUserWeldaMetaData(foundUser.userWeldaMetaData.userWeldaMetaDataId, foundUser.userWeldaMetaData);
        } else {
            await this.sendbirdSystemMessage(foundUser, SystemMessageConstants.MESSAGE_TYPE_RE_SUBSCRIPTION, foundUserProgram);
        }

        // 다음 멤버십 상태 조회
        const nextMembership = await this.membershipProvider.getNextMembershipStatus(foundUser.userId);

        // 목표 설정 터치베이스
        const userTouchBaseLogger = await this.usersService.startUserTouchBase(foundUser, foundUserProgram.startDate, true);

        // 코치 슬랙 터치베이스 알림
        await this.userProgramService.sendCoachingAlertWithSlack(foundUser, foundUserProgram, true, userTouchBaseLogger);

        // 멤버십 변경
        await this.membershipProvider.createUserMembership(foundUser.userId, nextMembership.membershipStatus, nextMembership.membershipDetailStatus);
    }

    // 구독 코드 메시지 생성 함수
    private async getProgramCodeMessageBody(programCodeSendModelDto: ProgramCodeSendModelDto, programCode: ProgramCode): Promise<string> {
        if (programCodeSendModelDto.body) {
            return `구독 코드: ${programCode.programCode}\n\n${programCodeSendModelDto.body}`;
        } else {
            const languagePack = await this.languagePackProvider.findByTypeAndCode(LanguageConstants.TYPE.SEND_MESSAGE, SendMessageConstants.sendMessageType.PROGRAM_CODE_SMS);
            const messageInfo = new HandlebarMessageBuilder(languagePack.text).withProgramCode(programCode.programCode).withUserName(programCode.receiverName).build();

            return messageInfo.message;
        }
    }

    async getProgramCode(programCode: string) {
        return await this.programCodeService.findByProgramCode(programCode);
    }

    // 프로그램 코드 생성 및 받는 사람 매핑
    async createAndAssignIssueWaitProgramCode(programCodeIssueModelDto: ProgramCodeIssueModelDto, programCodeSendModelDto: ProgramCodeSendModelDto) {
        try {
            const foundProgramCodeList = await this.createProgramCodeIssue(programCodeIssueModelDto);

            const phoneNumberUtil = PhoneNumberUtil.getInstance();
            for (let i = 0; i < foundProgramCodeList.length; i++) {
                const programCode = foundProgramCodeList[i];
                programCode.receiverName = programCodeSendModelDto.recipients[i].name;

                const parsedNumber = phoneNumberUtil.parse(programCodeSendModelDto.recipients[i].phone, 'KR');
                const phoneNumber = phoneNumberUtil.formatInOriginalFormat(parsedNumber);

                // 전화번호에 '-' 있으면 제외시킨다.
                programCodeSendModelDto.recipients[i].phone = phoneNumber.replace(/-/gi, '');

                programCode.receiverPhone = programCodeSendModelDto.recipients[i].phone;
            }

            return foundProgramCodeList;
        } catch (error) {
            throw new HttpException(
                {
                    statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
                    message: '프로그램 인증 코드 생성 시 오류가 발생하였습니다.',
                    code: 'PCS003',
                },
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    /**
     * 유저의 구독권 정보를 가져온다.
     * 조회하는 코치와 매칭되는 구독권 + 그 이전 구독권 전부를 조회 (취소 구독권 제외)
     * @param coachId
     * @param memberUserId
     */
    async getUserProgramByAssignedCoachId(coachId: number, memberUserId: number): Promise<UserProgram[] | null> {
        const foundCoach = await this.usersService.getUserByUserId(coachId);

        // 최근 구독권 포함 이전 구독권 조회
        const userProgramQuery = this.userProgramRepository.createQueryBuilder('up');
        // 해당 구독권 코치 정보를 가져오기 위해
        // 구독권 유지 인 경우는 joinPreviousId로 조인
        userProgramQuery.leftJoinAndMapMany('up.coachGroups', CoachGroup, 'cg', 'cg.userProgramId = COALESCE(up.joinPreviousId, up.userProgramId)');
        userProgramQuery.where('up.userId = :memberUserId', { memberUserId });
        userProgramQuery.andWhere('up.status IN (:...status)', {
            status: [
                CommonConstants.USER_PROGRAM_STATUS_RUNNING,
                CommonConstants.USER_PROGRAM_STATUS_MAINTAIN,
                CommonConstants.USER_PROGRAM_STATUS_CANCELED,
                CommonConstants.USER_PROGRAM_STATUS_USER_START_WAIT,
            ],
        });
        userProgramQuery.orderBy(`CASE WHEN up.status = 'U' THEN 0 ELSE 1 END`, CommonConstants.TYPEORM_SORT_ORDER_ASCENDING);
        userProgramQuery.addOrderBy('up.endDate', CommonConstants.TYPEORM_SORT_ORDER_ASCENDING);
        userProgramQuery.addOrderBy('up.startDate', CommonConstants.TYPEORM_SORT_ORDER_ASCENDING);
        userProgramQuery.addOrderBy('up.createDate', CommonConstants.TYPEORM_SORT_ORDER_ASCENDING);
        // 연속 구독인 경우 연속구독의 가장 최신
        userProgramQuery.leftJoinAndMapOne('up.continuousProgram', UserProgram, 'prev', 'prev.joinPreviousId = up.userProgramId AND prev.status = :continuousStatus AND prev.finishDate = up.endDate', {
            continuousStatus: CommonConstants.USER_PROGRAM_STATUS_CONTINUOUS,
        });

        // 관리자인 경우 사용자의 구독권 전부 조회
        if (foundCoach.userType === CommonConstants.USER_TYPE_WELL_CHECK_DIET_ADMINISTRATOR || foundCoach.userType === PartnerConstant.UserType.MonitoringUser) {
            return await userProgramQuery.getMany();
        }

        // 코치가 해당 유저를 코칭한 가장 최근의 구독권 조회
        const coachGroupQuery = this.coachGroupRepository.createQueryBuilder('cg');
        coachGroupQuery.leftJoinAndMapOne('cg.userProgram', UserProgram, 'up', 'up.userProgramId = cg.userProgramId');
        coachGroupQuery.leftJoin(User, 'mu', 'mu.userId = cg.userId'); // 코치 정보
        coachGroupQuery.leftJoin(User, 'hu', 'hu.userId = mu.parentCoachId'); // 헤드코치 정보
        coachGroupQuery.where('cg.memberUserId = :memberUserId', { memberUserId });
        // 해드 코치인 경우 메인 코치 내역 포함 조회
        if (foundCoach.coachType === CommonConstants.COACH_TYPE_MAIN) {
            coachGroupQuery.andWhere('cg.userId = :coachId', { coachId });
        } else if (foundCoach.coachType === CommonConstants.COACH_TYPE_HEAD) {
            coachGroupQuery.andWhere('(cg.userId = :coachId OR mu.parentCoachId = :coachId)', { coachId });
        }

        coachGroupQuery.orderBy('cg.createDate', CommonConstants.TYPEORM_SORT_ORDER_DESCENDING);

        const latestCoachGroup: CoachGroup = await coachGroupQuery.getOne();

        // 해당 유저 코치 내역이 없는 경우
        if (!latestCoachGroup) {
            return null;
        }

        // 관리자가 아닌 경우 자신이 코칭한 최근 구독권 이전만 조회 가능
        userProgramQuery.andWhere('up.endDate <= :latestEndDate', { latestEndDate: latestCoachGroup.userProgram.endDate });
        // 코치인 경우 0일차 노출 X
        userProgramQuery.andWhere('up.status IN (:...status)', {
            status: [CommonConstants.USER_PROGRAM_STATUS_RUNNING, CommonConstants.USER_PROGRAM_STATUS_MAINTAIN, CommonConstants.USER_PROGRAM_STATUS_CANCELED],
        });

        return await userProgramQuery.getMany();
    }

    async getUserProgramByUserProgramId(userProgramId: number) {
        return await this.userProgramRepository.findOne({ where: { userProgramId }, relations: { user: true } });
    }

    // 구독 유지 구독권 조회
    async getUserProgramByJoinPreviousId(userProgramId: number) {
        return await this.userProgramRepository.find({
            where: { joinPreviousId: userProgramId },
            order: { startDate: CommonConstants.TYPEORM_SORT_ORDER_DESCENDING, finishDate: CommonConstants.TYPEORM_SORT_ORDER_DESCENDING, createDate: CommonConstants.TYPEORM_SORT_ORDER_DESCENDING },
        });
    }

    async getCurrentRunningAndStartWaitUserProgramByUserId(userId: number) {
        return await this.userProgramRepository.findOne({ where: { userId: userId, status: In([CommonConstants.USER_PROGRAM_STATUS_RUNNING, CommonConstants.USER_PROGRAM_STATUS_USER_START_WAIT]) } });
    }

    /**
     * 사용자 구독 이력 조회
     * @param userId
     * @param searchRequestDto
     */
    async getSubscriptionLogByUserId(userId: number, searchRequestDto: SearchRequestDto) {
        const queryBuilder = this.userProgramRepository.createQueryBuilder('up');
        queryBuilder.where('up.userId = :userId', { userId });
        queryBuilder.andWhere('up.status IN (:...status)', {
            status: [
                CommonConstants.USER_PROGRAM_STATUS_USER_START_WAIT,
                CommonConstants.USER_PROGRAM_STATUS_MAINTAIN,
                CommonConstants.USER_PROGRAM_STATUS_CANCELED,
                CommonConstants.USER_PROGRAM_STATUS_CONTINUOUS,
                CommonConstants.USER_PROGRAM_STATUS_RUNNING,
            ],
        });
        queryBuilder.orderBy('up.createDate', CommonConstants.TYPEORM_SORT_ORDER_DESCENDING);

        SearchUtil.setOffset(searchRequestDto);

        queryBuilder.limit(searchRequestDto.windowSize);
        queryBuilder.offset(searchRequestDto.offset);

        searchRequestDto.totalCount = await queryBuilder.getCount();
        SearchUtil.setLastPages(searchRequestDto);

        const subscriptionLogList = await queryBuilder.disableEscaping().getMany();
        return subscriptionLogList.map((subscriptionLog) => {
            subscriptionLog.endDate = subscriptionLog.finishDate;
            return subscriptionLog;
        });
    }

    async getUserProgramBySubscriptionTagId(subscriptionTagId: number) {
        const queryBuilder = this.userProgramRepository.createQueryBuilder('up');
        queryBuilder.where('up.subscriptionTagId = :subscriptionTagId', { subscriptionTagId });
        queryBuilder.andWhere('up.status IN (:...status)', {
            status: [
                CommonConstants.USER_PROGRAM_STATUS_MAINTAIN,
                CommonConstants.USER_PROGRAM_STATUS_CANCELED,
                CommonConstants.USER_PROGRAM_STATUS_CONTINUOUS,
                CommonConstants.USER_PROGRAM_STATUS_RUNNING,
                CommonConstants.USER_PROGRAM_STATUS_USER_START_WAIT,
            ],
        });
        queryBuilder.groupBy('up.userId');

        return await queryBuilder.getMany();
    }
}
