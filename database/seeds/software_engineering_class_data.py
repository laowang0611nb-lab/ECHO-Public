from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class KnowledgePointDefinition:
    name: str
    description: str


@dataclass(frozen=True)
class ChapterDefinition:
    title: str
    summary: str
    points: tuple[KnowledgePointDefinition, ...]


@dataclass(frozen=True)
class ResourceDefinition:
    key: str
    file_name: str
    display_name: str
    resource_type: str
    page_count: int
    summary: str
    author: str
    keywords: tuple[str, ...]
    section_titles: tuple[str, ...]
    parsing: bool = False


STUDENT_NAMES = (
    "张晨",
    "李雨桐",
    "王浩然",
    "陈思远",
    "赵可欣",
    "周子墨",
    "刘佳宁",
    "孙宇航",
    "黄晓雨",
    "吴一凡",
    "徐嘉豪",
    "何若曦",
    "高子涵",
    "郑博文",
    "冯思源",
    "宋佳琪",
    "蒋亦辰",
    "谢欣怡",
    "韩泽宇",
    "唐语彤",
    "沈嘉航",
    "邓雨欣",
    "曹宇轩",
    "彭诗涵",
    "梁子豪",
    "许芷柔",
    "林俊熙",
    "方雅楠",
    "罗嘉铭",
    "姚可欣",
    "董一鸣",
    "袁梦琪",
    "潘浩宇",
    "蒋若宁",
    "蔡文博",
    "余诗雅",
    "叶俊杰",
    "汪梦涵",
    "杜嘉乐",
    "戴雨蒙",
    "陆子轩",
    "魏嘉怡",
    "程宇航",
    "江念",
    "苏子涵",
    "卢欣",
    "任嘉诚",
    "邱雨薇",
)

SCORE_BANDS = (
    ("excellent", 8, 86.0, 96.0),
    ("good", 14, 76.0, 86.0),
    ("medium", 12, 66.0, 76.0),
    ("attention", 10, 52.0, 66.0),
    ("risk", 4, 35.0, 52.0),
)

CHAPTER_DEFINITIONS = (
    ChapterDefinition(
        "软件工程导论",
        "建立软件工程、软件生命周期和工程质量的基础认识。",
        (
            KnowledgePointDefinition("软件与软件工程", "理解软件、程序、数据和文档的关系，以及软件工程的目标。"),
            KnowledgePointDefinition("软件危机", "识别进度、成本、质量和维护方面的典型危机表现。"),
            KnowledgePointDefinition("软件工程知识体系", "了解需求、设计、构造、测试、维护和管理等知识领域。"),
            KnowledgePointDefinition("软件生命周期", "理解从立项到退役的完整生命周期阶段。"),
            KnowledgePointDefinition("利益相关者", "识别用户、客户、开发者、运维者和教师等角色。"),
            KnowledgePointDefinition("软件质量属性", "理解正确性、可靠性、可用性、安全性和可维护性。"),
            KnowledgePointDefinition("工程伦理", "理解隐私、责任、版权和职业诚信要求。"),
        ),
    ),
    ChapterDefinition(
        "软件过程与生命周期",
        "比较传统与敏捷过程模型，并理解过程选择依据。",
        (
            KnowledgePointDefinition("瀑布模型", "理解阶段顺序、评审门禁和文档驱动特点。"),
            KnowledgePointDefinition("迭代模型", "理解通过多轮迭代逐步完善产品的过程。"),
            KnowledgePointDefinition("增量模型", "理解按功能切片持续交付可用增量的方式。"),
            KnowledgePointDefinition("螺旋模型", "理解以风险分析为核心的演进式过程。"),
            KnowledgePointDefinition("敏捷开发", "理解迭代、反馈、协作和响应变化的原则。"),
            KnowledgePointDefinition("Scrum", "理解 Product Backlog、Sprint 和评审会议。"),
            KnowledgePointDefinition("DevOps", "理解开发、测试、发布和运维协同的持续交付文化。"),
        ),
    ),
    ChapterDefinition(
        "需求工程",
        "从获取、分析、建模到验证和变更管理形成需求闭环。",
        (
            KnowledgePointDefinition("需求获取", "使用访谈、观察、问卷和原型等方法识别真实需求。"),
            KnowledgePointDefinition("需求分类", "区分功能需求、非功能需求、业务规则和约束。"),
            KnowledgePointDefinition("用例建模", "使用参与者、场景和用例关系描述系统行为。"),
            KnowledgePointDefinition("用户故事", "用角色、目标和价值描述可协商的需求。"),
            KnowledgePointDefinition("需求规格说明", "形成一致、完整、可验证的需求基线。"),
            KnowledgePointDefinition("需求验证", "通过评审、原型和验收标准检查需求质量。"),
            KnowledgePointDefinition("需求变更管理", "控制变更影响、审批、版本和追踪关系。"),
        ),
    ),
    ChapterDefinition(
        "软件设计基础",
        "掌握模块化设计和高质量结构设计原则。",
        (
            KnowledgePointDefinition("设计原则", "理解单一职责、开闭、里氏替换和依赖倒置。"),
            KnowledgePointDefinition("模块化", "把复杂系统分解为职责清晰的模块。"),
            KnowledgePointDefinition("抽象与封装", "隐藏实现细节并暴露稳定接口。"),
            KnowledgePointDefinition("信息隐藏", "让模块只暴露完成职责所需的信息。"),
            KnowledgePointDefinition("耦合", "降低模块之间不必要的依赖强度。"),
            KnowledgePointDefinition("内聚", "提高模块内部职责的一致性和集中度。"),
            KnowledgePointDefinition("设计模式", "理解常见模式解决的问题、结构和代价。"),
        ),
    ),
    ChapterDefinition(
        "面向对象设计",
        "使用对象、职责、关系和 UML 模型表达软件结构。",
        (
            KnowledgePointDefinition("类与对象", "区分类型定义与运行时对象，并识别职责。"),
            KnowledgePointDefinition("继承", "理解复用、扩展和继承层次的风险。"),
            KnowledgePointDefinition("多态", "通过统一接口处理不同实现。"),
            KnowledgePointDefinition("接口与实现", "面向接口编程并隔离变化。"),
            KnowledgePointDefinition("UML 类图", "表达类、属性、方法和关系。"),
            KnowledgePointDefinition("顺序图", "表达对象之间的时间顺序和消息交互。"),
            KnowledgePointDefinition("设计重构", "在不改变外部行为的前提下改善内部结构。"),
        ),
    ),
    ChapterDefinition(
        "软件测试基础",
        "理解测试目标、层次、方法和缺陷闭环。",
        (
            KnowledgePointDefinition("测试目标", "通过测试验证需求并尽可能早地发现缺陷。"),
            KnowledgePointDefinition("黑盒测试", "根据输入输出和功能行为设计测试。"),
            KnowledgePointDefinition("白盒测试", "根据代码结构、分支和路径设计测试。"),
            KnowledgePointDefinition("测试用例", "由前置条件、步骤、输入和预期结果组成。"),
            KnowledgePointDefinition("缺陷生命周期", "跟踪缺陷从发现、修复到关闭的状态流转。"),
            KnowledgePointDefinition("测试级别", "区分单元、集成、系统和验收测试。"),
            KnowledgePointDefinition("回归测试", "确认修改没有破坏既有功能。"),
        ),
    ),
    ChapterDefinition(
        "测试用例设计",
        "使用多种方法设计可追踪、可复现的测试数据。",
        (
            KnowledgePointDefinition("等价类划分", "把输入域划分为有效和无效等价类。"),
            KnowledgePointDefinition("边界值分析", "重点检查最小值、最大值及邻近取值。"),
            KnowledgePointDefinition("判定表", "使用条件与动作组合处理复杂业务规则。"),
            KnowledgePointDefinition("因果图", "分析输入原因与输出结果之间的约束。"),
            KnowledgePointDefinition("路径覆盖", "按照控制流路径设计白盒测试用例。"),
            KnowledgePointDefinition("条件覆盖", "覆盖判定中的原子条件真值和假值。"),
            KnowledgePointDefinition("测试数据设计", "构造合法、非法、边界和异常数据。"),
        ),
    ),
    ChapterDefinition(
        "软件项目管理",
        "围绕范围、进度、成本、风险和协作管理项目。",
        (
            KnowledgePointDefinition("项目范围", "明确交付边界、目标和排除项。"),
            KnowledgePointDefinition("工作分解结构", "把交付物逐层分解为可估算工作包。"),
            KnowledgePointDefinition("进度计划", "建立任务依赖、里程碑和关键路径。"),
            KnowledgePointDefinition("成本估算", "使用类比、参数和自下而上方法估算工作量。"),
            KnowledgePointDefinition("风险管理", "识别、分析、应对并监控项目风险。"),
            KnowledgePointDefinition("团队协作", "建立角色、沟通、评审和决策机制。"),
            KnowledgePointDefinition("项目复盘", "总结结果、偏差、原因和改进行动。"),
        ),
    ),
    ChapterDefinition(
        "软件质量与度量",
        "用质量模型和度量指标评价产品与过程。",
        (
            KnowledgePointDefinition("质量模型", "从产品、过程和使用质量维度评价软件。"),
            KnowledgePointDefinition("可靠性", "理解故障率、恢复能力和容错设计。"),
            KnowledgePointDefinition("可用性", "关注用户完成任务时的效率和满意度。"),
            KnowledgePointDefinition("可维护性", "理解可理解性、可修改性和可测试性。"),
            KnowledgePointDefinition("代码覆盖率", "区分语句、分支、条件、路径和需求覆盖。"),
            KnowledgePointDefinition("缺陷密度", "结合规模口径分析缺陷集中程度。"),
            KnowledgePointDefinition("质量门禁", "在流水线中设置可执行的质量通过条件。"),
        ),
    ),
    ChapterDefinition(
        "软件配置与 DevOps",
        "通过版本、构建、发布和配置管理支撑持续交付。",
        (
            KnowledgePointDefinition("版本控制", "跟踪文件、变更、作者和可恢复版本。"),
            KnowledgePointDefinition("分支策略", "平衡并行开发、评审和发布稳定性。"),
            KnowledgePointDefinition("构建自动化", "使用可重复命令生成可验证制品。"),
            KnowledgePointDefinition("持续集成", "频繁合并并使用自动化检查快速反馈。"),
            KnowledgePointDefinition("持续交付", "保持软件随时可发布并保留人工决策。"),
            KnowledgePointDefinition("制品管理", "对构建产物进行版本、来源和完整性管理。"),
            KnowledgePointDefinition("环境配置", "隔离开发、测试、预发布和生产配置。"),
        ),
    ),
    ChapterDefinition(
        "软件维护与演化",
        "理解系统交付后的维护、演进和退役活动。",
        (
            KnowledgePointDefinition("维护类型", "区分纠正、适应、完善和预防性维护。"),
            KnowledgePointDefinition("遗留系统", "评估业务价值、技术风险和替换成本。"),
            KnowledgePointDefinition("重构与重写", "根据风险选择渐进重构或整体重写。"),
            KnowledgePointDefinition("技术债务", "识别并管理短期妥协产生的长期成本。"),
            KnowledgePointDefinition("变更影响分析", "评估修改对代码、数据、接口和用户的影响。"),
            KnowledgePointDefinition("可观测性", "通过日志、指标和追踪定位运行问题。"),
            KnowledgePointDefinition("软件退役", "规划数据迁移、停用通知和归档。"),
        ),
    ),
    ChapterDefinition(
        "综合项目实践",
        "将需求、设计、开发、测试和交付串成完整项目闭环。",
        (
            KnowledgePointDefinition("项目立项", "明确目标、成功标准、边界和资源。"),
            KnowledgePointDefinition("需求基线", "冻结首个可迭代交付范围并建立追踪。"),
            KnowledgePointDefinition("架构评审", "检查关键质量属性、风险和演进路径。"),
            KnowledgePointDefinition("迭代计划", "把优先级转化为可验证的迭代目标。"),
            KnowledgePointDefinition("代码审查", "检查正确性、可读性、测试和安全风险。"),
            KnowledgePointDefinition("测试验收", "以需求和验收标准为依据确认交付。"),
            KnowledgePointDefinition("交付与复盘", "完成部署、文档、复盘和改进闭环。"),
        ),
    ),
)

RESOURCE_DEFINITIONS = (
    ResourceDefinition(
        key="textbook",
        file_name="软件工程核心讲义（演示版）.pdf",
        display_name="软件工程核心讲义",
        resource_type="textbook",
        page_count=60,
        summary="覆盖 12 章、84 个知识点的原创演示讲义，用于章节解析、引用和 PDF 定位。",
        author="ECHO 软件工程课程组",
        keywords=("软件工程", "课程讲义", "需求", "设计", "测试"),
        section_titles=tuple(chapter.title for chapter in CHAPTER_DEFINITIONS),
    ),
    ResourceDefinition(
        key="lab",
        file_name="软件工程实验指导书.pdf",
        display_name="软件工程实验指导书",
        resource_type="lab",
        page_count=36,
        summary="包含需求访谈、用例建模、设计评审、测试设计、CI 流水线和项目复盘六个实验。",
        author="ECHO 软件工程实验中心",
        keywords=("实验指导", "用例建模", "测试设计", "持续集成"),
        section_titles=(
            "实验一 需求访谈与用户故事",
            "实验二 用例建模与需求基线",
            "实验三 软件设计评审",
            "实验四 测试用例设计",
            "实验五 持续集成与质量门禁",
            "实验六 项目演示与复盘",
        ),
    ),
    ResourceDefinition(
        key="exercises",
        file_name="软件工程案例与习题集.pdf",
        display_name="软件工程案例与习题集",
        resource_type="question_bank",
        page_count=44,
        summary="包含选择题、判断题、简答题、建模题、测试设计题和项目分析题。",
        author="ECHO 软件工程课程组",
        keywords=("习题", "案例", "测试用例", "项目分析"),
        section_titles=tuple(f"第{index}组 软件工程综合练习" for index in range(1, 12)),
    ),
    ResourceDefinition(
        key="srs-template",
        file_name="软件需求规格说明书模板.pdf",
        display_name="软件需求规格说明书模板",
        resource_type="outline",
        page_count=20,
        summary="用于演示正在解析中的课程资源状态和资源状态筛选。",
        author="ECHO 课程资源中心",
        keywords=("SRS", "需求规格说明", "课程模板"),
        section_titles=(
            "封面与文档控制",
            "项目背景与目标",
            "利益相关者",
            "业务规则",
            "功能需求",
            "非功能需求",
            "数据需求",
            "接口需求",
            "验收标准",
            "需求追踪矩阵",
            "变更记录",
            "术语表",
            "风险与假设",
            "供应商约束",
            "合规与隐私",
            "性能指标",
            "安全要求",
            "部署约束",
            "需求评审清单",
            "审批记录",
        ),
        parsing=True,
    ),
)

__all__ = [
    "CHAPTER_DEFINITIONS",
    "RESOURCE_DEFINITIONS",
    "SCORE_BANDS",
    "STUDENT_NAMES",
    "ChapterDefinition",
    "KnowledgePointDefinition",
    "ResourceDefinition",
]
