-- Candor testing analytics. Every query excludes users.is_internal = true.
-- Null is treated as false so accounts created before the migration remain included.

-- A. Return rate: opened users and users active on two or more local dates.
with external_events as (
  select * from public.events_external
), opened as (
  select distinct anonymous_id from external_events where event_name = 'app_opened'
), returned as (
  select anonymous_id from external_events where client_local_date is not null
  group by anonymous_id having count(distinct client_local_date) >= 2
)
select count(*) as users_opened,
  count(*) filter (where r.anonymous_id is not null) as users_returned,
  round(count(*) filter (where r.anonymous_id is not null)::numeric / nullif(count(*), 0), 3) as return_rate
from opened o left join returned r using (anonymous_id);

-- B. Story funnel, median active reading time, and early exits.
with x as (
  select * from public.events_external
), opened as (
  select properties->>'story_id' story_id, count(distinct anonymous_id) users_opened from x where event_name='story_opened' group by 1
), completed as (
  select properties->>'story_id' story_id, count(distinct anonymous_id) users_completed,
    percentile_cont(.5) within group (order by (properties->>'active_seconds')::numeric) median_active_seconds
  from x where event_name='story_completed' group by 1
), left_story as (
  select properties->>'story_id' story_id,
    avg(case when (properties->>'reached_bottom')::boolean then 0 else 1 end) share_left_before_bottom
  from x where event_name='story_left' group by 1
)
select o.*, coalesce(c.users_completed,0) users_completed, c.median_active_seconds, l.share_left_before_bottom
from opened o left join completed c using(story_id) left join left_story l using(story_id);

-- C. Screen transitions and last observed screen per session.
with x as (
  select * from public.events_external where event_name='screen_viewed'
), ordered as (
  select *, lead(properties->>'screen') over(partition by anonymous_id,session_id order by created_at,id) next_screen,
    row_number() over(partition by anonymous_id,session_id order by created_at desc,id desc) reverse_n
  from x
)
select 'transition' kind, properties->>'screen' from_screen, next_screen to_screen, count(*) occurrences
from ordered where next_screen is not null group by 2,3
union all
select 'last_screen', properties->>'screen', null, count(*) from ordered where reverse_n=1 group by 2
order by occurrences desc;

-- D. Game starts/completions, user reach, and duration.
with x as (
  select * from public.events_external where event_name in ('game_started','game_completed')
)
select properties->>'game_type' game_type, properties->>'mode' mode,
  count(*) filter(where event_name='game_started') started,
  count(*) filter(where event_name='game_completed') completed,
  count(distinct anonymous_id) filter(where event_name='game_started') users_tried,
  percentile_cont(.5) within group(order by (properties->>'duration_ms')::numeric)
    filter(where event_name='game_completed') median_duration_ms
from x group by 1,2;

-- E. Input method share and accuracy, scored attempts only.
with a as (
  select ga.* from public.game_attempts ga join public.users u using(anonymous_id)
  where coalesce(u.is_internal,false)=false and ga.mode='scored' and ga.input_method is not null
)
select game_type,input_method,count(*) attempts,
  round(count(*)::numeric/sum(count(*)) over(partition by game_type),3) input_share,
  avg(is_correct::int) accuracy from a group by 1,2;

-- F. Spot the Lean response time and accuracy by card position.
with a as (
  select ga.* from public.game_attempts ga join public.users u using(anonymous_id)
  where coalesce(u.is_internal,false)=false and ga.game_type='lean_guess' and ga.mode='scored'
)
select card_position, percentile_cont(.5) within group(order by response_ms) median_response_ms,
  avg(is_correct::int) accuracy, count(*) answers from a group by 1 order by 1;

-- G. Fact or Opinion accuracy by content round/card and moves by completed round.
with a as (
  select ga.* from public.game_attempts ga join public.users u using(anonymous_id)
  where coalesce(u.is_internal,false)=false and ga.game_type='fact_opinion' and ga.mode='scored'
), accuracy as (
  select content_round_id,content_id,avg(is_correct::int) accuracy,count(*) answers from a group by 1,2
), moves as (
  select e.properties->>'game_type' game_type,
    percentile_cont(.5) within group(order by (e.properties->>'moves')::numeric) median_moves
  from public.events_external e
  where e.event_name='game_completed'
    and e.properties->>'game_type'='fact_opinion' and e.properties->>'mode'='scored'
  group by 1
)
select a.*,m.median_moves from accuracy a cross join moves m order by content_round_id,content_id;

-- H. Interaction rates/counts.
with x as (
  select * from public.events_external where event_name in ('section_opened','section_visible','filter_used','extend_tapped')
)
select event_name,properties,count(*) actions,count(distinct anonymous_id) users from x group by 1,2 order by actions desc;

-- I. DAU and install funnel.
with x as (
  select * from public.events_external
)
select client_local_date,count(distinct anonymous_id) dau,
 count(distinct anonymous_id) filter(where event_name='install_prompt_shown') prompt_users,
 count(distinct anonymous_id) filter(where event_name='app_opened' and properties->>'display_mode'='standalone') standalone_users
from x where client_local_date is not null group by 1 order by 1;

-- J. Reminder analysis intentionally omitted: reminders are not built in this MVP.

-- K. User-visible errors.
with x as (
 select * from public.events_external where event_name='error_shown'
)
select properties->>'error_type' error_type,properties->>'screen' screen,count(*) errors from x group by 1,2 order by 3 desc;

-- L. Landing/story drop-off.
with x as (
 select * from public.events_external
), flags as (
 select anonymous_id,bool_or(event_name='landing_viewed') landed,bool_or(event_name='story_opened') opened,
   bool_or(event_name='story_completed') completed from x group by anonymous_id
)
select count(*) filter(where landed and not opened) landing_without_story,
 count(*) filter(where opened and not completed) story_without_completion from flags;

-- M. One external user's timeline. Replace the UUID in params before running.
with params as (
  select '<ANONYMOUS_ID>'::uuid anonymous_id
)
select t.created_at, t.event_name, t.session_id, t.properties
from public.user_timeline t
join params p using (anonymous_id)
order by t.created_at;

-- M2. The same user's sessions, including screen order.
with params as (
  select '<ANONYMOUS_ID>'::uuid anonymous_id
)
select t.session_id, min(t.created_at) first_event_time, max(t.created_at) last_event_time,
  count(*) event_count,
  array_agg(t.properties->>'screen' order by t.created_at)
    filter (where t.event_name = 'screen_viewed') ordered_screens
from public.user_timeline t
join params p using (anonymous_id)
group by t.session_id
order by first_event_time;

-- N1. Share of story opens where each always-visible political section became visible.
with opens as (
  select id open_event_id, anonymous_id, session_id, properties->>'story_id' story_id, created_at opened_at,
    lead(created_at) over (partition by anonymous_id, session_id order by created_at, id) next_opened_at
  from public.events_external where event_name = 'story_opened'
), views as (
  select o.*,
    exists(select 1 from public.events_external e where e.anonymous_id=o.anonymous_id
      and e.session_id is not distinct from o.session_id and e.properties->>'story_id'=o.story_id
      and e.event_name='section_visible' and e.properties->>'section'='sources'
      and e.created_at>=o.opened_at and (o.next_opened_at is null or e.created_at<o.next_opened_at)) sources_visible,
    exists(select 1 from public.events_external e where e.anonymous_id=o.anonymous_id
      and e.session_id is not distinct from o.session_id and e.properties->>'story_id'=o.story_id
      and e.event_name='section_visible' and e.properties->>'section'='whats_different'
      and e.created_at>=o.opened_at and (o.next_opened_at is null or e.created_at<o.next_opened_at)) whats_different_visible
  from opens o
)
select count(*) story_views,
  round(avg(sources_visible::int), 3) share_sources_visible,
  round(avg(whats_different_visible::int), 3) share_whats_different_visible
from views;

-- N2. Completion rate for views with versus without What's different visible.
with opens as (
  select id open_event_id, anonymous_id, session_id, properties->>'story_id' story_id, created_at opened_at,
    lead(created_at) over (partition by anonymous_id, session_id order by created_at, id) next_opened_at
  from public.events_external where event_name = 'story_opened'
), views as (
  select o.*,
    exists(select 1 from public.events_external e where e.anonymous_id=o.anonymous_id
      and e.session_id is not distinct from o.session_id and e.properties->>'story_id'=o.story_id
      and e.event_name='section_visible' and e.properties->>'section'='whats_different'
      and e.created_at>=o.opened_at and (o.next_opened_at is null or e.created_at<o.next_opened_at)) whats_different_visible,
    exists(select 1 from public.events_external e where e.anonymous_id=o.anonymous_id
      and e.session_id is not distinct from o.session_id and e.properties->>'story_id'=o.story_id
      and e.event_name='story_completed'
      and e.created_at>=o.opened_at and (o.next_opened_at is null or e.created_at<o.next_opened_at)) completed
  from opens o
)
select whats_different_visible, count(*) story_views, round(avg(completed::int), 3) completion_rate
from views group by whats_different_visible order by whats_different_visible desc;

-- N3. Among story views that reached the bottom, share that did so without seeing What's different.
with opens as (
  select id open_event_id, anonymous_id, session_id, properties->>'story_id' story_id, created_at opened_at,
    lead(created_at) over (partition by anonymous_id, session_id order by created_at, id) next_opened_at
  from public.events_external where event_name = 'story_opened'
), views as (
  select o.*,
    exists(select 1 from public.events_external e where e.anonymous_id=o.anonymous_id
      and e.session_id is not distinct from o.session_id and e.properties->>'story_id'=o.story_id
      and e.event_name='section_visible' and e.properties->>'section'='whats_different'
      and e.created_at>=o.opened_at and (o.next_opened_at is null or e.created_at<o.next_opened_at)) whats_different_visible,
    exists(select 1 from public.events_external e where e.anonymous_id=o.anonymous_id
      and e.session_id is not distinct from o.session_id and e.properties->>'story_id'=o.story_id
      and e.event_name='story_left' and (e.properties->>'reached_bottom')::boolean
      and e.created_at>=o.opened_at and (o.next_opened_at is null or e.created_at<o.next_opened_at)) reached_bottom
  from opens o
)
select count(*) filter (where reached_bottom) bottom_reached_views,
  round(count(*) filter (where reached_bottom and not whats_different_visible)::numeric
    / nullif(count(*) filter (where reached_bottom), 0), 3) share_bottom_without_whats_different
from views;

