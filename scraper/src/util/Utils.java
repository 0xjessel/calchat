package util;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.lang.reflect.Field;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

import model.ClassModel;
import model.ClassModel.Schedule;

import org.json.JSONObject;

import redis.clients.jedis.Jedis;
import redis.clients.jedis.Pipeline;

public class Utils {
	public static final String[] TERMS = { "SP", "SU", "FL" };
	public static final String[] TERMS_STRINGS = { "spring", "summer", "fall" };

	private static final String REDIS_URL = "db.calchat.net";
	private static final String MAPS_URL = "http://maps.google.com/maps/api/geocode/json?address=%s,Berkeley,CA&sensor=false";

	private static Set<String> buildings;
	private static Set<String> savedBuildings;

	private static Map<String, String> abbreviations;
	private static Map<String, String> locations;
	private static Map<String, String> renames;
	private static Thread saveLocationsThread;
	private static boolean saveLocationsAlive;

	private static Jedis jedis; // used to make the pipeline for async calls
	private static Jedis syncJedis1; // for synchronous calls
	private static Pipeline pipeline0;

	// connect to redis db and take care of all one-time parsing
	public static boolean connect() {
		try {
			jedis = new Jedis(REDIS_URL);
			jedis.connect();
			jedis.select(0);

			System.err.println("Connected to Redis db 0. Flushing db...");

			jedis.flushDB();

			syncJedis1 = new Jedis(REDIS_URL);
			syncJedis1.connect();
			syncJedis1.select(1);

			pipeline0 = jedis.pipelined();

			buildings = new HashSet<String>();
			savedBuildings = new HashSet<String>();

			System.err
					.println("Connected to Redis db 1. Fetching manual input data...");

			synchronized (syncJedis1) {
				abbreviations = syncJedis1.hgetAll("abbreviations");
				locations = syncJedis1.hgetAll("locations");
				renames = syncJedis1.hgetAll("renames");

				Map<String, String> validrooms = syncJedis1
						.hgetAll("validrooms");
				for (String room : validrooms.keySet()) {
					setValidRoom(room, room);
				}

			}

			saveLocationsThread = new Thread(new Runnable() {

				@Override
				public void run() {
					saveLocations();
				}
			});
			saveLocationsAlive = true;
			saveLocationsThread.start();

			return true;
		} catch (Exception exception) {
			return false;
		}
	}

	public static String trim(String text) {
		int start = text.length(), end = text.length();
		for (int i = 0; i < text.length(); i++) {
			char c = text.charAt(i);
			if (c >= '!' && c <= '~') {
				start = i;
				break;
			}
		}

		for (int i = text.length() - 1; i >= 0; i--) {
			char c = text.charAt(i);
			if (c >= '!' && c <= '~') {
				end = i + 1;
				break;
			}
		}

		if (start >= text.length() || start >= end) {
			return "";
		} else {
			return text.substring(start, end);
		}
	}

	public static double stringScore(String s) {
		s = s.toUpperCase();
		double hash = 0;
		char[] chars = s.toCharArray();

		for (int i = 0; i < chars.length; i++) {
			hash += (chars[i] - '0') / Math.pow('Z' - '0' + 1, i);
		}
		return hash;
	}

	public static String stripHigh(String s) {
		return s.replaceAll("[^A-Za-z0-9:-]", "").toUpperCase();
	}

	static Map<String, double[]> timeConversionCacheMap = new HashMap<String, double[]>();

	public static double[] getHalfHoursFromInterval(String interval) {
		double[] key = timeConversionCacheMap.get(interval);
		if (key != null) {
			return key;
		}

		String[] intervalArray = interval.split("-");
		String fromTimeString = intervalArray[0];
		double fromTime = fromTimeString.length() > 2 ? Integer
				.parseInt(fromTimeString.substring(0,
						fromTimeString.length() - 2)) + .5 : Integer
				.parseInt(fromTimeString);
		String to = intervalArray[1];
		String toTimeString = to.substring(0, to.length() - 1);
		double toTime = toTimeString.length() > 2 ? Integer
				.parseInt(toTimeString.substring(0, toTimeString.length() - 2)) + .5
				: Integer.parseInt(toTimeString);
		boolean toPM = to.charAt(to.length() - 1) == 'P';
		boolean fromPM = toPM
				&& (fromTime >= 12 || (toTime < 12 && fromTime < toTime));

		double fromMilitaryTime = fromTime + (fromPM && fromTime < 12 ? 12 : 0);
		double toMilitaryTime = toTime + (toPM && toTime < 12 ? 12 : 0);

		int hours = (int) ((toMilitaryTime - fromMilitaryTime) * 2);

		double[] hoursArray = new double[hours];
		for (int i = 0; i < hours; i++) {
			hoursArray[i] = fromMilitaryTime + i * .5;
		}

		timeConversionCacheMap.put(interval, hoursArray);

		return hoursArray;
	}

	public static void setValidRoom(String scoreby, String value) {
		synchronized (pipeline0) {
			pipeline0.zadd("validrooms", stringScore(scoreby), value);
		}
	}

	// saves class into db
	public static void save(ClassModel m) {
		String id = getClassId(m);
		String key = String.format("class:%s", id);

		// classes
		try {
			Map<String, String> mapping = new HashMap<String, String>();
			for (Field field : ClassModel.class.getFields()) {
				String value = field.get(m).toString();

				mapping.put(field.getName(), value);
			}

			synchronized (pipeline0) {
				pipeline0.hmset(key, mapping);
			}
		} catch (IllegalArgumentException e) {
			e.printStackTrace();
		} catch (IllegalAccessException e) {
			e.printStackTrace();
		}

		// validrooms
		String department = stripHigh(m.department);
		String number = stripHigh(m.number);
		String combine = department + number;
		setValidRoom(combine, id);

		// abbreviated validrooms
		String abbreviation = abbreviations.get(department);
		if (abbreviation != null) {
			// assume there's at most 1 abbreviation
			String combine2 = abbreviation + number;
			setValidRoom(combine2, id + "#");
		}

		for (Schedule schedule : m.schedules) {
			// locations
			synchronized (buildings) {
				if (!savedBuildings.contains(schedule.building)
						&& buildings.add(schedule.building)) {
					System.err.println(String.format("Found new building: %s",
							schedule.building));
					buildings.notify();
				}
			}

			// classtimes
			String[] days = schedule.days.split("(?=\\p{Upper})");
			for (String day : days) {
				if (day.equals("")) {
					continue;
				}
				String roomName = String.format("%s%s",
						stripHigh(schedule.buildingNumber),
						stripHigh(schedule.building));
				setValidRoom(roomName, String.format("%s%s$",
						stripHigh(schedule.buildingNumber),
						stripHigh(schedule.building)));
				String roomKey = String.format("room:%s%s:%s",
						stripHigh(schedule.buildingNumber),
						stripHigh(schedule.building), day);
				String field = stripHigh(schedule.time);

				double[] hours = getHalfHoursFromInterval(field);
				for (double hour : hours) {
					synchronized (pipeline0) {
						pipeline0.hset(roomKey, String.valueOf(hour), id);
					}
				}
			}
		}
	}

	public static String getClassId(ClassModel m) {
		return String.format("%s%s", stripHigh(m.department),
				stripHigh(m.number));
	}

	public static void disconnect() {
		// wait for saveLocationsThread to finish
		System.err.println("Waiting for locations to be saved...");
		synchronized (buildings) {
			saveLocationsAlive = false;
			buildings.notify();
		}
	}

	// called from saveLocationsThread
	private static void disconnectHelper() {
		System.err.println("Disconnecting from Redis server...");

		synchronized (pipeline0) {
			pipeline0.sync();
		}
		pipeline0 = null;
		jedis.disconnect();
		jedis = null;

		syncJedis1.disconnect();
		syncJedis1 = null;

		buildings = null;
		savedBuildings = null;
	}

	// background thread that constantly is looking for new buildings 
	public static void saveLocations() {
		while (true) {
			String building = null;
			synchronized (buildings) {
				if (buildings.isEmpty()) {
					if (saveLocationsAlive) {
						try {
							buildings.wait();
							continue;
						} catch (InterruptedException e1) {
							// TODO Auto-generated catch block
							e1.printStackTrace();
						}
					} else {
						disconnectHelper();
						return;
					}
				}

				building = buildings.toArray(new String[] {})[0];
				buildings.remove(building);
				savedBuildings.add(building);
			}

			try {
				saveLocation(building);
			} catch (InterruptedException e) {
				// TODO Auto-generated catch block
				e.printStackTrace();
			}
		}
	}

	// save building location to db
	public static void saveLocation(String building)
			throws InterruptedException {
		HttpURLConnection connection = null;
		JSONObject json = null;
		try {
			String key = String.format("location:%s", stripHigh(building));
			String hkey = "location:all";

			String lat = null, lng = null, location = null;
			location = locations.get(stripHigh(building));

			String longName = building;

			if (location == null) {
				String name = null;

				name = renames.get(stripHigh(building));

				if (name == null)
					name = building;

				String url = String.format(MAPS_URL,
						URLEncoder.encode(name, "UTF-8"));
				connection = (HttpURLConnection) new URL(url).openConnection();

				BufferedReader rd = new BufferedReader(new InputStreamReader(
						connection.getInputStream(), "UTF-8"));

				StringBuilder sb = new StringBuilder();
				String line;
				while ((line = rd.readLine()) != null) {
					sb.append(line);
				}
				rd.close();

				json = new JSONObject(sb.toString());

				// check for failure
				if ("Berkeley, CA, USA".equals(json.getJSONArray("results")
						.getJSONObject(0).getString("formatted_address"))) {
					System.err.println(String.format("E: Couldn't locate: %s",
							name));
					return;
				}

				JSONObject locationJson = json.getJSONArray("results")
						.getJSONObject(0).getJSONObject("geometry")
						.getJSONObject("location");

				longName = json.getJSONArray("results").getJSONObject(0)
						.getString("formatted_address").split("[,:]")[0];

				lat = String.format("%f", locationJson.getDouble("lat"));
				lng = String.format("%f", locationJson.getDouble("lng"));
				location = String.format("%s,%s", lat, lng);
			} else {
				lat = location.split(",")[0];
				lng = location.split(",")[1];
			}

			synchronized (pipeline0) {
				Map<String, String> value = new HashMap<String, String>();
				value.put("lat", lat);
				value.put("lng", lng);
				value.put("name", building);
				value.put("longname", longName);
				pipeline0.hmset(key, value);

				pipeline0.hset(hkey, location, stripHigh(building));

				setValidRoom(stripHigh(building), stripHigh(building));

				if (longName != null
						&& !stripHigh(building).equals(stripHigh(longName))) {
					setValidRoom(stripHigh(longName), stripHigh(building) + '#');
				}
			}

			System.err.println(String.format("Found location for: %s (%s)",
					building, location));
		} catch (Exception ex) {
			ex.printStackTrace();
			if (json != null)
				System.err.println(json.toString());
		} finally {
			if (connection != null)
				connection.disconnect();

			try {
				// avoid Google Maps rate-limit
				Thread.sleep(500);
			} catch (InterruptedException e) {
				e.printStackTrace();
			}
		}
	}

	public static void main(String[] args) {
		System.out.println(stringScore("DEVELOPMENT"));
	}
}
