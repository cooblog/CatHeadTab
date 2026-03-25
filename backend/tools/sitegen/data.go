package main

// merge appends extra sites to a base slice.
func merge(base []S, extras ...[]S) []S {
	for _, e := range extras {
		base = append(base, e...)
	}
	return base
}

// siteData returns all sites keyed by category ID.
func siteData() map[string][]S {
	m := make(map[string][]S)

	// Existing 10 categories — base + extra expansions
	m["a0000000-0000-0000-0000-000000000001"] = merge(video(), videoEx(), videoBoost())
	m["a0000000-0000-0000-0000-000000000002"] = merge(live(), liveEx(), liveBoost())
	m["a0000000-0000-0000-0000-000000000003"] = merge(ai(), aiEx(), aiBoost())
	m["a0000000-0000-0000-0000-000000000004"] = merge(news(), newsEx(), newsBoost())
	m["a0000000-0000-0000-0000-000000000005"] = merge(social(), socialEx(), socialBoost())
	m["a0000000-0000-0000-0000-000000000006"] = merge(developer(), developerEx(), developerBoost())
	m["a0000000-0000-0000-0000-000000000007"] = merge(shopping(), shoppingEx(), shoppingBoost())
	m["a0000000-0000-0000-0000-000000000008"] = merge(music(), musicEx(), musicBoost())
	m["a0000000-0000-0000-0000-000000000009"] = merge(tools(), toolsEx(), toolsBoost())
	m["a0000000-0000-0000-0000-000000000010"] = merge(design(), designEx(), designBoost())

	// 50 new categories — base + extra expansions
	m["c0000000-0000-0000-0000-000000000001"] = merge(searchEngine(), searchEngineEx(), searchEngineBoost())
	m["c0000000-0000-0000-0000-000000000002"] = merge(email(), emailEx(), emailBoost())
	m["c0000000-0000-0000-0000-000000000003"] = merge(finance(), financeEx(), financeBoost())
	m["c0000000-0000-0000-0000-000000000004"] = merge(education(), educationEx())
	m["c0000000-0000-0000-0000-000000000005"] = merge(travel(), travelEx())
	m["c0000000-0000-0000-0000-000000000006"] = merge(food(), foodEx())
	m["c0000000-0000-0000-0000-000000000007"] = merge(health(), healthEx())
	m["c0000000-0000-0000-0000-000000000008"] = merge(sports(), sportsEx())
	m["c0000000-0000-0000-0000-000000000009"] = merge(realEstate(), realEstateEx())
	m["c0000000-0000-0000-0000-000000000010"] = merge(automotive(), automotiveEx())
	m["c0000000-0000-0000-0000-000000000011"] = merge(job(), jobEx(), jobBoost())
	m["c0000000-0000-0000-0000-000000000012"] = merge(government(), governmentEx())
	m["c0000000-0000-0000-0000-000000000013"] = merge(photography(), photographyEx())
	m["c0000000-0000-0000-0000-000000000014"] = merge(anime(), animeEx())
	m["c0000000-0000-0000-0000-000000000015"] = merge(cryptocurrency(), cryptocurrencyEx())
	m["c0000000-0000-0000-0000-000000000016"] = merge(science(), scienceEx())
	m["c0000000-0000-0000-0000-000000000017"] = merge(writing(), writingEx())
	m["c0000000-0000-0000-0000-000000000018"] = merge(podcast(), podcastEx())
	m["c0000000-0000-0000-0000-000000000019"] = merge(startup(), startupEx())
	m["c0000000-0000-0000-0000-000000000020"] = merge(legal(), legalEx())
	m["c0000000-0000-0000-0000-000000000021"] = merge(pets(), petsEx())
	m["c0000000-0000-0000-0000-000000000022"] = merge(fashion(), fashionEx())
	m["c0000000-0000-0000-0000-000000000023"] = merge(kids(), kidsEx())
	m["c0000000-0000-0000-0000-000000000024"] = merge(agriculture(), agricultureEx())
	m["c0000000-0000-0000-0000-000000000025"] = merge(environment(), environmentEx())
	m["c0000000-0000-0000-0000-000000000026"] = merge(logistics(), logisticsEx())
	m["c0000000-0000-0000-0000-000000000027"] = merge(telecom(), telecomEx())
	m["c0000000-0000-0000-0000-000000000028"] = merge(mapNav(), mapNavEx())
	m["c0000000-0000-0000-0000-000000000029"] = merge(weather(), weatherEx())
	m["c0000000-0000-0000-0000-000000000030"] = merge(forum(), forumEx())
	m["c0000000-0000-0000-0000-000000000031"] = merge(wiki(), wikiEx())
	m["c0000000-0000-0000-0000-000000000032"] = merge(cloudService(), cloudServiceEx())
	m["c0000000-0000-0000-0000-000000000033"] = merge(hosting(), hostingEx())
	m["c0000000-0000-0000-0000-000000000034"] = merge(database(), databaseEx())
	m["c0000000-0000-0000-0000-000000000035"] = merge(devops(), devopsEx())
	m["c0000000-0000-0000-0000-000000000036"] = merge(security(), securityEx())
	m["c0000000-0000-0000-0000-000000000037"] = merge(frontend(), frontendEx())
	m["c0000000-0000-0000-0000-000000000038"] = merge(backend(), backendEx())
	m["c0000000-0000-0000-0000-000000000039"] = merge(mobileDev(), mobileDevEx())
	m["c0000000-0000-0000-0000-000000000040"] = merge(dataScience(), dataScienceEx())
	m["c0000000-0000-0000-0000-000000000041"] = merge(gameDev(), gameDevEx())
	m["c0000000-0000-0000-0000-000000000042"] = merge(openSource(), openSourceEx())
	m["c0000000-0000-0000-0000-000000000043"] = merge(apiService(), apiServiceEx())
	m["c0000000-0000-0000-0000-000000000044"] = merge(marketing(), marketingEx())
	m["c0000000-0000-0000-0000-000000000045"] = merge(freelance(), freelanceEx())
	m["c0000000-0000-0000-0000-000000000046"] = merge(threeDAR(), threeDAREx())
	m["c0000000-0000-0000-0000-000000000047"] = merge(noCode(), noCodeEx())
	m["c0000000-0000-0000-0000-000000000048"] = merge(lifestyle(), lifestyleEx())
	m["c0000000-0000-0000-0000-000000000049"] = merge(reading(), readingEx())
	m["c0000000-0000-0000-0000-000000000050"] = merge(gaming(), gamingEx())

	return m
}
