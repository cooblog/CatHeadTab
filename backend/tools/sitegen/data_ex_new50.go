package main

// Extension functions for the 50 new categories.
// Categories that already have 50+ sites need minimal additions.
// Categories with fewer need more.

func searchEngineEx() []S {
	return []S{
		{"Perplexity", "https://www.perplexity.ai", "AI搜索引擎"},
		{"Neeva", "https://neeva.com", "无广告搜索"},
		{"Gigablast", "https://www.gigablast.com", "开源搜索引擎"},
		{"Lilo", "https://www.lilo.org", "法国公益搜索"},
		{"Gibiru", "https://gibiru.com", "匿名搜索"},
		{"Yep", "https://yep.com", "Ahrefs搜索引擎"},
		{"Stract", "https://stract.com", "开源搜索引擎"},
		{"Wiby", "https://wiby.me", "复古网页搜索"},
		{"Million Short", "https://millionshort.com", "去除热门结果搜索"},
		{"Carrot2", "https://search.carrot2.org", "聚类搜索引擎"},
		{"Fagan Finder", "https://www.faganfinder.com", "多搜索引擎聚合"},
		{"Yippy", "https://yippy.com", "聚类搜索"},
		{"BoardReader", "https://boardreader.com", "论坛搜索"},
		{"Social Searcher", "https://www.social-searcher.com", "社交媒体搜索"},
		{"PubChem", "https://pubchem.ncbi.nlm.nih.gov", "化学物质搜索"},
		{"Wayback Machine", "https://web.archive.org", "网页历史搜索"},
		{"Common Crawl", "https://commoncrawl.org", "开放爬虫数据"},
		{"Mwmbl", "https://mwmbl.org", "非盈利搜索"},
		{"Stork Search", "https://stork-search.net", "静态站搜索"},
		{"Typesense", "https://typesense.org", "开源搜索引擎"},
	}
}

func emailEx() []S {
	return []S{
		{"Skiff Mail", "https://skiff.com/mail", "加密邮箱"},
		{"Runbox", "https://runbox.com", "挪威隐私邮箱"},
		{"StartMail", "https://www.startmail.com", "隐私邮箱"},
		{"CounterMail", "https://countermail.com", "安全邮箱"},
		{"Disroot", "https://disroot.org", "隐私邮箱"},
		{"Riseup", "https://riseup.net", "活动者邮箱"},
		{"Migadu", "https://www.migadu.com", "邮箱托管"},
		{"MXroute", "https://mxroute.com", "邮箱托管服务"},
		{"ImprovMX", "https://improvmx.com", "邮件转发"},
		{"SimpleLogin", "https://simplelogin.io", "邮箱别名"},
		{"AnonAddy", "https://anonaddy.com", "匿名邮箱转发"},
		{"Forward Email", "https://forwardemail.net", "开源邮件转发"},
		{"Mailcow", "https://mailcow.email", "自托管邮件"},
		{"Mail-in-a-Box", "https://mailinabox.email", "自建邮件服务器"},
		{"Postal", "https://docs.postalserver.io", "开源邮件平台"},
		{"Maddy", "https://maddy.email", "邮件服务器"},
		{"Haraka", "https://haraka.github.io", "Node邮件服务器"},
		{"Roundcube", "https://roundcube.net", "开源Webmail"},
		{"SOGo", "https://www.sogo.nu", "开源群件"},
		{"Cypht", "https://cypht.org", "轻量Webmail"},
	}
}

func financeEx() []S {
	return []S{
		{"SoFi", "https://www.sofi.com", "数字金融平台"},
		{"Acorns", "https://www.acorns.com", "零钱投资"},
		{"Betterment", "https://www.betterment.com", "智能投顾"},
		{"Wealthfront", "https://www.wealthfront.com", "自动化投资"},
		{"M1 Finance", "https://www.m1finance.com", "自动投资平台"},
		{"Public", "https://public.com", "社交投资"},
		{"eToro", "https://www.etoro.com", "社交交易平台"},
		{"Moomoo", "https://www.moomoo.com", "富途海外版"},
		{"Thinkorswim", "https://www.schwab.com/trading/thinkorswim", "交易平台"},
		{"Quantopian", "https://www.quantopian.com", "量化投资"},
		{"QuantConnect", "https://www.quantconnect.com", "量化交易平台"},
		{"Alpaca", "https://alpaca.markets", "交易API"},
		{"Plaid", "https://plaid.com", "金融数据API"},
		{"Yodlee", "https://www.yodlee.com", "金融数据聚合"},
		{"Kabbage", "https://www.kabbage.com", "小企业贷款"},
		{"Brex", "https://www.brex.com", "创业公司信用卡"},
		{"Ramp", "https://ramp.com", "企业支出管理"},
		{"Divvy", "https://www.divvy.co", "费用管理"},
		{"Melio", "https://www.meliopayments.com", "B2B支付"},
		{"Bill.com", "https://www.bill.com", "应付账款管理"},
	}
}



func jobEx() []S {
	return []S{
		{"Otta", "https://otta.com", "科技公司工作"},
		{"Simplify", "https://simplify.jobs", "一键投递"},
		{"YC Jobs", "https://www.ycombinator.com/jobs", "YC创业公司招聘"},
		{"Startup.jobs", "https://startup.jobs", "创业公司工作"},
		{"Authentic Jobs", "https://authenticjobs.com", "设计师开发者"},
		{"Dribbble Jobs", "https://dribbble.com/jobs", "设计师工作"},
		{"Behance Jobs", "https://www.behance.net/joblist", "创意工作"},
		{"PowerToFly", "https://powertofly.com", "多元化招聘"},
		{"Diversify Tech", "https://www.diversifytech.co", "多元化科技工作"},
		{"Women Who Code", "https://www.womenwhocode.com/jobs", "女性科技工作"},
		{"DevITjobs", "https://devitjobs.com", "开发者薪资透明"},
		{"Stack Overflow Jobs", "https://stackoverflow.com/jobs", "开发者工作"},
		{"Key Values", "https://www.keyvalues.com", "工程师文化匹配"},
		{"Levels.fyi", "https://www.levels.fyi", "科技薪资对比"},
		{"Glassdoor Salaries", "https://www.glassdoor.com/Salaries", "薪资查询"},
		{"Comparably", "https://www.comparably.com", "公司文化薪资"},
		{"Blind", "https://www.teamblind.com", "匿名职场社区"},
		{"100offer", "https://www.100offer.com", "高端人才拍卖"},
		{"脉脉", "https://maimai.cn", "中国职场社交"},
		{"看准网", "https://www.kanzhun.com", "公司评价"},
	}
}






